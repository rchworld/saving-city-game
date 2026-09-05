import * as THREE from 'three';
import { PLAYER_MAX_HP, RESPAWN_BUILDING_ID, RIVER_FALL_GRACE } from './constants.js';
import { clamp } from './utils.js';

const MOVE_SPEED = 16;
const TURN_LERP = 12;
const CAMERA_DISTANCE = 9;
const CAMERA_HEIGHT = 3.2;
const MOUSE_SENSITIVITY = 0.0028;
const CAR_DISMOUNT_RADIUS = 3.5;

// The player is rendered as a simple third-person humanoid so items can
// visibly appear "in their arms" when equipped.
export class Player {
  constructor(scene, input, buildingsById) {
    this.scene = scene;
    this.input = input;
    this.buildingsById = buildingsById;

    this.hp = PLAYER_MAX_HP;
    this.maxHp = PLAYER_MAX_HP;
    this.isDead = false;
    this.invulnTimer = 0;

    this.yaw = 0; // faces +Z, i.e. across the bridge toward the city
    this.pitch = -0.15;

    this.mountedCar = null; // Car instance the player is currently riding
    this.carOffset = null; // player's offset from the car's center while mounted
    this.onRooftopId = null; // building id if standing on a rooftop pad
    this.interiorId = null; // interior key ('jangmi1'/'jangmi2'/'jangmi3'/'lotte') if indoors

    this.fallingInRiver = false; // true during the 3s Han River drowning grace window
    this.fallGraceTimer = 0;
    this.diedInRiver = false; // set true for one frame if the grace window expired

    this.carriedChild = null; // rescued-child ref currently being carried
    this.carryAnchor = null; // THREE.Group the carried child's mesh is parented to

    this.velocityY = 0;
    this.groundY = 0; // current standing surface height

    this._buildMesh();

    this.group.position.set(0, 0, 0);
    scene.add(this.group);

    this.moveDir = new THREE.Vector3();
    this.tmpForward = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
  }

  _buildMesh() {
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a6fd8, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 8), bodyMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skinMat);
    head.position.y = 1.95;
    head.castShadow = true;
    this.group.add(head);

    const armGeo = new THREE.CapsuleGeometry(0.14, 0.6, 4, 6);
    this.leftArm = new THREE.Mesh(armGeo, skinMat);
    this.leftArm.position.set(-0.55, 1.25, 0);
    this.leftArm.rotation.z = 0.25;
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, skinMat);
    this.rightArm.position.set(0.55, 1.25, 0);
    this.rightArm.rotation.z = -0.25;
    this.group.add(this.rightArm);

    const legGeo = new THREE.CapsuleGeometry(0.16, 0.7, 4, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2b2b33, roughness: 0.8 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.2, 0.35, 0);
    this.group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.2, 0.35, 0);
    this.group.add(legR);

    // Anchor where held items are attached, roughly in front of the chest.
    this.handAnchor = new THREE.Group();
    this.handAnchor.position.set(0.35, 1.25, 0.5);
    this.group.add(this.handAnchor);

    // A rescued child rides here, piggyback-style.
    this.carryAnchor = new THREE.Group();
    this.carryAnchor.position.set(0, 1.5, -0.35);
    this.group.add(this.carryAnchor);
  }

  carryChild(child) {
    if (this.carriedChild) return false;
    this.carriedChild = child;
    child.mesh.position.set(0, 0, 0);
    child.mesh.rotation.set(0, 0, 0);
    this.carryAnchor.add(child.mesh);
    return true;
  }

  releaseCarriedChild() {
    if (!this.carriedChild) return null;
    const child = this.carriedChild;
    this.carryAnchor.remove(child.mesh);
    this.carriedChild = null;
    return child;
  }

  enterInterior(id, worldPos) {
    this.interiorId = id;
    this.onRooftopId = null;
    this.mountedCar = null;
    this.fallingInRiver = false;
    this.group.position.set(worldPos.x, 0, worldPos.z);
  }

  exitInterior(worldPos) {
    this.interiorId = null;
    this.group.position.set(worldPos.x, worldPos.y ?? 0.9, worldPos.z);
  }

  respawnAtBuilding(id = RESPAWN_BUILDING_ID) {
    const b = this.buildingsById[id];
    const pos = b ? b.rooftopWorldPos : new THREE.Vector3(0, 4, 0);
    this.group.position.set(pos.x, pos.y, pos.z);
    this.mountedCar = null;
    this.onRooftopId = b ? id : null;
    this.interiorId = null;
    this.fallingInRiver = false;
    this.releaseCarriedChild(); // a child being carried is lost if the player dies
    this.hp = this.maxHp;
    this.invulnTimer = 1.5;
  }

  takeDamage(amount) {
    if (this.invulnTimer > 0 || this.isDead) return;
    if (this.shieldActive) return; // shield blocks all incoming damage while up
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this.invulnTimer = 0.4;
    if (this.hp <= 0) {
      this.isDead = true;
    }
  }

  get position() {
    return this.group.position;
  }

  // Movement + camera update. `world` exposes river bounds / bridge info for
  // the "fall in river -> respawn" rule.
  update(dt, world) {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;

    if (this.isDead) {
      this.respawnAtBuilding(RESPAWN_BUILDING_ID);
      this.isDead = false;
      return;
    }

    if (this.fallingInRiver) {
      this._updateFalling(dt);
      return;
    }

    const { x: mdx, y: mdy } = this.input.consumeMouseDelta();
    this.yaw -= mdx * MOUSE_SENSITIVITY;
    this.pitch = clamp(this.pitch - mdy * MOUSE_SENSITIVITY, -1.1, 0.9);

    this.tmpForward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.tmpRight.set(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));

    this.moveDir.set(0, 0, 0);
    if (this.input.forward) this.moveDir.add(this.tmpForward);
    if (this.input.backward) this.moveDir.sub(this.tmpForward);
    if (this.input.right) this.moveDir.add(this.tmpRight);
    if (this.input.left) this.moveDir.sub(this.tmpRight);

    const moving = this.moveDir.lengthSq() > 0.0001;
    if (moving) {
      this.moveDir.normalize();

      if (this.mountedCar) {
        // While riding a moving car, movement adjusts the player's offset
        // from the car's center rather than world position directly, so the
        // car's own motion doesn't overwrite the player's steps each frame.
        this.carOffset.x += this.moveDir.x * MOVE_SPEED * dt;
        this.carOffset.z += this.moveDir.z * MOVE_SPEED * dt;
      } else {
        this.group.position.x += this.moveDir.x * MOVE_SPEED * dt;
        this.group.position.z += this.moveDir.z * MOVE_SPEED * dt;
      }

      const targetAngle = Math.atan2(this.moveDir.x, this.moveDir.z);
      const currentAngle = this.group.rotation.y;
      let diff = targetAngle - currentAngle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * clamp(TURN_LERP * dt, 0, 1);

      // Leaving a rooftop pad by walking off it drops the player back down.
      if (this.onRooftopId && this._distFromRoofCenter(world) > 8) {
        this.onRooftopId = null;
      }
      if (this.mountedCar && this.carOffset.length() > CAR_DISMOUNT_RADIUS) {
        // Step off exactly where they walked to, at ground level.
        this.group.position.set(
          this.mountedCar.group.position.x + this.carOffset.x,
          0,
          this.mountedCar.group.position.z + this.carOffset.z
        );
        this.mountedCar = null;
        this.carOffset = null;
      }
    }

    this._resolveVerticalPosition(world);
    this._animateWalk(dt, moving);
  }

  _distFromRoofCenter(world) {
    const b = world.buildingsById[this.onRooftopId];
    if (!b) return 999;
    const dx = this.group.position.x - b.pos.x;
    const dz = this.group.position.z - b.pos.z;
    return Math.hypot(dx, dz);
  }

  mountCar(car) {
    const dx = this.group.position.x - car.group.position.x;
    const dz = this.group.position.z - car.group.position.z;
    this.mountedCar = car;
    this.carOffset = new THREE.Vector3(dx, 0, dz);
  }

  _resolveVerticalPosition(world) {
    if (this.onRooftopId) {
      const b = world.buildingsById[this.onRooftopId];
      if (b && !b.isCollapsed) {
        this.group.position.y = b.height + 1.6;
        return;
      }
      this.onRooftopId = null;
    }
    if (this.mountedCar) {
      this.group.position.set(
        this.mountedCar.group.position.x + this.carOffset.x,
        this.mountedCar.roofHeight,
        this.mountedCar.group.position.z + this.carOffset.z
      );
      return;
    }

    // Ground level, except the bridge deck & river.
    const onDeck = Math.abs(this.group.position.z) < world.bridgeHalfLength
      && Math.abs(this.group.position.x) < world.bridgeHalfWidth;
    if (onDeck) {
      this.group.position.y = world.bridgeDeckY;
      return;
    }
    const [zMin, zMax] = world.riverZBounds;
    if (this.group.position.z > zMin && this.group.position.z < zMax) {
      // off the deck but still over the Han River -> falling in, starts the grace window
      this._startRiverFall();
      return;
    }
    this.group.position.y = 0;
  }

  _startRiverFall() {
    if (this.fallingInRiver) return;
    this.fallingInRiver = true;
    this.fallGraceTimer = RIVER_FALL_GRACE;
    this._fallStartY = this.group.position.y;
  }

  _updateFalling(dt) {
    this.fallGraceTimer -= dt;
    const t = clamp(1 - this.fallGraceTimer / RIVER_FALL_GRACE, 0, 1);
    this.group.position.y = this._fallStartY - t * 6;
    if (this.fallGraceTimer <= 0) {
      this.fallingInRiver = false;
      this.diedInRiver = true;
    }
  }

  // Called when the star's wish is used while falling: interrupts the
  // drowning, lifts the player skyward, and lands them safely inside Lotte
  // Tower's interior.
  escapeRiverFall(lotteWorldPos) {
    if (!this.fallingInRiver) return false;
    this.fallingInRiver = false;
    this.fallGraceTimer = 0;
    this.enterInterior('lotte', lotteWorldPos);
    this.invulnTimer = 1.5;
    return true;
  }

  _animateWalk(dt, moving) {
    this._walkT = (this._walkT || 0) + (moving ? dt * 8 : 0);
    const swing = moving ? Math.sin(this._walkT) * 0.5 : 0;
    this.leftArm.rotation.x = swing;
    this.rightArm.rotation.x = -swing;
  }

  updateCamera(camera, world) {
    const targetPos = this.group.position;
    const camYaw = this.yaw;
    const camPitch = this.pitch;

    // Interiors are low-ceilinged and narrow, so pull the camera in close
    // and low to avoid clipping through corridor walls/ceiling.
    const distance = this.interiorId ? 3.2 : CAMERA_DISTANCE;
    const camHeight = this.interiorId ? 1.5 : CAMERA_HEIGHT;
    const maxY = this.interiorId ? targetPos.y + 2.5 : Infinity;
    const offset = new THREE.Vector3(
      Math.sin(camYaw) * -Math.cos(camPitch),
      Math.sin(camPitch) + 0.15,
      Math.cos(camYaw) * -Math.cos(camPitch)
    ).multiplyScalar(distance);

    const desired = new THREE.Vector3(
      targetPos.x + offset.x,
      targetPos.y + camHeight + offset.y * 1.4,
      targetPos.z + offset.z
    );

    if (desired.y < targetPos.y + 1.2) desired.y = targetPos.y + 1.2;
    if (desired.y > maxY) desired.y = maxY;

    camera.position.lerp(desired, 1);
    const lookAt = new THREE.Vector3(targetPos.x, targetPos.y + 1.6, targetPos.z);
    camera.lookAt(lookAt);
  }
}
