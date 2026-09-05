import * as THREE from 'three';
import {
  COLORS, MINION_COUNT, BOSS_MAX_HP, BOSS_SPAWN, BOSS_LASER_INTERVAL,
  BOSS_LASER_TELEGRAPH, BOSS_LASER_DURATION, CITY_BOUNDS, RIVER_HALF_WIDTH,
} from './constants.js';
import { dist2D, randRange, randChoice, makeTextLabel } from './utils.js';

const MINION_SPEED = 3.2;
const MINION_AGGRO_RADIUS = 14;
const MINION_ATTACK_RADIUS = 1.5;
const MINION_ATTACK_DAMAGE = 6;
const MINION_ATTACK_COOLDOWN = 1.2;

const STOMP_TRIGGER_RANGE = 13;
const STOMP_RAISE_TIME = 0.6;
const STOMP_SLAM_TIME = 0.25;
const STOMP_DAMAGE_RADIUS = 7;
const STOMP_DAMAGE = 22;

function buildMinionMesh(kind) {
  const group = new THREE.Group();
  if (kind === 'snail') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8fae5a, roughness: 0.8 });
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xd08a3e, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.5, 4, 8), bodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.35;
    group.add(body);
    const shell = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4, 0.2, 40, 6, 2, 3), shellMat);
    shell.position.set(0, 0.75, -0.1);
    shell.scale.setScalar(0.6);
    group.add(shell);
    group.userData.radius = 0.6;
  } else if (kind === 'beluga') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 1.1, 4, 10), mat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.9;
    group.add(body);
    const melon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), mat);
    melon.position.set(0.75, 1.05, 0);
    group.add(melon);
    group.userData.radius = 0.9;
  } else {
    // generic little "imp" monster
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7a3fa0, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffe600, emissive: 0x554400 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), eyeMat);
      eye.position.set(side * 0.22, 0.72, 0.42);
      group.add(eye);
    }
    const legMat = new THREE.MeshStandardMaterial({ color: 0x552277, roughness: 0.7 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), legMat);
      leg.position.set(side * 0.25, 0.15, 0);
      group.add(leg);
    }
    group.userData.radius = 0.7;
  }
  return group;
}

export class Minion {
  // `wanderBounds` optionally confines this minion to a small area (used for
  // monsters spawned inside a building interior, which must not wander off
  // toward the main city's coordinates).
  constructor(scene, pos, kind = 'imp', wanderBounds = null) {
    this.kind = kind;
    this.alive = true;
    this.hp = 1;
    this.isBoss = false;
    this.radius = kind === 'beluga' ? 0.9 : kind === 'snail' ? 0.6 : 0.7;
    this.group = buildMinionMesh(kind);
    this.group.position.set(pos.x, 0, pos.z);
    scene.add(this.group);

    this.wanderBounds = wanderBounds; // { cx, cz, radius } or null for the full city
    this.homeInteriorId = null; // set for interior-spawned monsters so they only aggro inside that interior
    this.wanderTarget = new THREE.Vector3(pos.x, 0, pos.z);
    this._pickNewWanderTarget();
    this.attackCooldown = 0;
    this.speed = kind === 'snail' ? MINION_SPEED * 0.45 : kind === 'beluga' ? MINION_SPEED * 0.8 : MINION_SPEED;
  }

  _pickNewWanderTarget() {
    if (this.wanderBounds) {
      const { cx, cz, radius } = this.wanderBounds;
      const angle = randRange(0, Math.PI * 2);
      const r = randRange(0, radius);
      this.wanderTarget.set(cx + Math.cos(angle) * r, 0, cz + Math.sin(angle) * r);
      return;
    }
    const x = randRange(CITY_BOUNDS.minX + 10, CITY_BOUNDS.maxX - 10);
    const z = randRange(RIVER_HALF_WIDTH + 10, CITY_BOUNDS.maxZ - 10);
    this.wanderTarget.set(x, 0, z);
  }

  update(dt, player) {
    if (!this.alive) return;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    const p = this.group.position;
    const distToPlayer = dist2D(p.x, p.z, player.position.x, player.position.z);
    const playerReachable = !player.onRooftopId && !player.mountedCar && player.interiorId === this.homeInteriorId;

    let targetX, targetZ;
    if (playerReachable && distToPlayer < MINION_AGGRO_RADIUS) {
      targetX = player.position.x;
      targetZ = player.position.z;
      if (distToPlayer < MINION_ATTACK_RADIUS && this.attackCooldown <= 0) {
        player.takeDamage(MINION_ATTACK_DAMAGE);
        this.attackCooldown = MINION_ATTACK_COOLDOWN;
      }
    } else {
      if (dist2D(p.x, p.z, this.wanderTarget.x, this.wanderTarget.z) < 2) this._pickNewWanderTarget();
      targetX = this.wanderTarget.x;
      targetZ = this.wanderTarget.z;
    }

    const dx = targetX - p.x;
    const dz = targetZ - p.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.1) {
      p.x += (dx / len) * this.speed * dt;
      p.z += (dz / len) * this.speed * dt;
      this.group.rotation.y = Math.atan2(dx, dz);
    }
    this.group.position.y = Math.sin(performance.now() * 0.006 + p.x) * 0.06 + 0.02;
  }

  // Any successful hit kills a minion outright.
  takeHit() {
    if (!this.alive) return true;
    this.alive = false;
    this.group.visible = false;
    return true;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}

export class Boss {
  constructor(scene, buildings) {
    this.alive = true;
    this.isBoss = true;
    this.hp = BOSS_MAX_HP;
    this.maxHp = BOSS_MAX_HP;
    this.radius = 6;
    this.buildings = buildings;

    this.state = 'idle'; // idle -> telegraph -> firing -> idle
    this.timeToNextAttack = 8; // first strike comes a bit sooner for pacing
    this.telegraphTimer = 0;
    this.firingTimer = 0;
    this.targetBuilding = null;

    this.stompState = 'ready'; // ready -> raise -> slam -> cooldown
    this.stompTimer = 0;
    this.stompCooldown = randRange(3, 6);

    this._buildMesh(scene);
    this.group.position.set(BOSS_SPAWN.x, 0, BOSS_SPAWN.z);
    this._wanderTarget = new THREE.Vector3(BOSS_SPAWN.x, 0, BOSS_SPAWN.z);
  }

  _buildMesh(scene) {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: COLORS.bossRed, roughness: 0.55, flatShading: true });

    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(4.2, 0), skin);
    torso.position.y = 8;
    torso.scale.set(1, 1.5, 0.9);
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), skin);
    head.position.y = 14.5;
    head.castShadow = true;
    group.add(head);

    const eyeMat = new THREE.MeshStandardMaterial({ color: COLORS.bossGlow, emissive: COLORS.bossGlow, emissiveIntensity: 1.6 });
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), eyeMat.clone());
      eye.position.set(side * 1.1, 14.7, 2.1);
      group.add(eye);
      this.eyes.push(eye);
    }

    const limbMat = new THREE.MeshStandardMaterial({ color: 0x7a0e15, roughness: 0.7, flatShading: true });
    this.arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 7, 7), limbMat);
      arm.position.set(side * 4.4, 8.5, 0);
      arm.rotation.z = side * 0.35;
      group.add(arm);
      this.arms.push(arm);
    }
    this.legs = [];
    for (const side of [-1, 1]) {
      const legPivot = new THREE.Group();
      legPivot.position.set(side * 1.8, 7.45, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 7.5, 7), limbMat);
      leg.position.set(0, -3.75, 0);
      legPivot.add(leg);
      group.add(legPivot);
      this.legs.push(legPivot);
    }

    const stompRingGeo = new THREE.RingGeometry(1, 8, 28);
    stompRingGeo.rotateX(-Math.PI / 2);
    const stompRingMat = new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0, side: THREE.DoubleSide });
    this.stompRing = new THREE.Mesh(stompRingGeo, stompRingMat);
    scene.add(this.stompRing);

    const label = makeTextLabel('빨간 괴수', { color: '#ffdada', bg: 'rgba(60,0,0,0.55)' });
    label.position.set(0, 19, 0);
    group.add(label);

    this.group = group;
    scene.add(group);

    // Laser beam visual, hidden until firing.
    const beamGeo = new THREE.CylinderGeometry(0.35, 0.9, 1, 8, 1, true);
    beamGeo.translate(0, -0.5, 0);
    beamGeo.rotateX(Math.PI / 2);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.visible = false;
    scene.add(this.beam);

    const telegraphGeo = new THREE.RingGeometry(1, 3.4, 24);
    telegraphGeo.rotateX(-Math.PI / 2);
    const telegraphMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    this.telegraphRing = new THREE.Mesh(telegraphGeo, telegraphMat);
    this.telegraphRing.visible = false;
    scene.add(this.telegraphRing);
  }

  get eyePosition() {
    return new THREE.Vector3(this.group.position.x, 14.7, this.group.position.z);
  }

  takeHit(damage = 1) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - damage);
    for (const eye of this.eyes) eye.material.emissiveIntensity = 3;
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
      this.beam.visible = false;
      this.telegraphRing.visible = false;
      this.stompRing.material.opacity = 0;
      return true;
    }
    return false;
  }

  update(dt, ctx) {
    if (!this.alive) return;

    // gentle idle bob + slow wander near the mountain
    this.group.position.y = 0;
    const p = this.group.position;
    if (dist2D(p.x, p.z, this._wanderTarget.x, this._wanderTarget.z) < 3) {
      this._wanderTarget.set(BOSS_SPAWN.x + randRange(-25, 25), 0, BOSS_SPAWN.z + randRange(-20, 20));
    }
    const dx = this._wanderTarget.x - p.x;
    const dz = this._wanderTarget.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    if (this.state === 'idle') {
      p.x += (dx / len) * 1.1 * dt;
      p.z += (dz / len) * 1.1 * dt;
      this.group.rotation.y = Math.atan2(dx, dz);
    }
    for (const eye of this.eyes) {
      eye.material.emissiveIntensity = Math.max(1.4, eye.material.emissiveIntensity - dt * 3);
    }

    this._updateAttackCycle(dt, ctx);
    this._updateStomp(dt, ctx);
  }

  // A ground-slam melee attack the boss uses on nearby players in between
  // laser cycles, so it visibly tries to squash the player up close too.
  _updateStomp(dt, { player }) {
    const p = this.group.position;
    const distToPlayer = dist2D(p.x, p.z, player.position.x, player.position.z);

    if (this.stompState === 'ready') {
      this.stompCooldown -= dt;
      if (this.stompCooldown <= 0 && this.state === 'idle' && distToPlayer < STOMP_TRIGGER_RANGE) {
        this.stompState = 'raise';
        this.stompTimer = STOMP_RAISE_TIME;
      }
      return;
    }

    if (this.stompState === 'raise') {
      this.stompTimer -= dt;
      const t = 1 - Math.max(0, this.stompTimer / STOMP_RAISE_TIME);
      for (const leg of this.legs) leg.rotation.x = -t * 0.6;
      this.group.position.y = t * 1.2;
      if (this.stompTimer <= 0) {
        this.stompState = 'slam';
        this.stompTimer = STOMP_SLAM_TIME;
      }
      return;
    }

    if (this.stompState === 'slam') {
      this.stompTimer -= dt;
      const t = Math.max(0, this.stompTimer / STOMP_SLAM_TIME);
      for (const leg of this.legs) leg.rotation.x = -t * 0.6;
      this.group.position.y = t * 1.2;
      if (this.stompTimer <= 0) {
        this.group.position.y = 0;
        for (const leg of this.legs) leg.rotation.x = 0;
        this.stompRing.position.set(p.x, 0.25, p.z);
        this.stompRing.material.opacity = 0.8;
        if (dist2D(p.x, p.z, player.position.x, player.position.z) < STOMP_DAMAGE_RADIUS) {
          player.takeDamage(STOMP_DAMAGE);
        }
        this.stompState = 'cooldown';
        this.stompTimer = 0.5;
      }
      return;
    }

    if (this.stompRing.material.opacity > 0) {
      this.stompRing.material.opacity = Math.max(0, this.stompRing.material.opacity - dt * 2);
      this.stompRing.scale.setScalar(1 + (0.8 - this.stompRing.material.opacity) * 0.6);
    }

    if (this.stompState === 'cooldown') {
      this.stompTimer -= dt;
      if (this.stompTimer <= 0) {
        this.stompState = 'ready';
        this.stompCooldown = randRange(5, 9);
        this.stompRing.scale.setScalar(1);
      }
    }
  }

  _updateAttackCycle(dt, { buildings, player, onBossFireStart, onBuildingCollapse, minionsNearPlayer, onShieldBreak }) {
    if (this.state === 'idle') {
      this.timeToNextAttack -= dt;
      if (this.timeToNextAttack <= 0) {
        const alive = buildings.filter((b) => !b.isCollapsed && !b.isCollapsing);
        if (alive.length === 0) return;
        this.targetBuilding = randChoice(alive);
        this.state = 'telegraph';
        this.telegraphTimer = BOSS_LASER_TELEGRAPH;
        this.telegraphRing.visible = true;
        if (onBossFireStart) onBossFireStart(this.targetBuilding);
      }
      return;
    }

    if (this.state === 'telegraph') {
      this.telegraphRing.position.set(this.targetBuilding.pos.x, 0.3, this.targetBuilding.pos.z);
      this.telegraphRing.rotation.z += dt * 4;
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        this.state = 'firing';
        this.firingTimer = BOSS_LASER_DURATION;
        this.telegraphRing.visible = false;
        this.beam.visible = true;
      }
      return;
    }

    if (this.state === 'firing') {
      this._aimBeamAt(this.targetBuilding.pos);
      this.targetBuilding.applyLaser(dt);

      const nearBeam = dist2D(player.position.x, player.position.z, this.targetBuilding.pos.x, this.targetBuilding.pos.z) < this.targetBuilding.radius + 4;
      if (nearBeam) {
        if (player.shieldActive) {
          // Shield-break condition: player is caught inside the beam's target
          // building footprint while a swarm of minions presses in at the
          // same time as the boss's laser — an overwhelming assault.
          if (minionsNearPlayer >= 5) {
            player.shieldActive = false;
            if (onShieldBreak) onShieldBreak();
          }
        } else {
          player.takeDamage(dt * 20);
        }
      }

      this.firingTimer -= dt;
      if (this.firingTimer <= 0) {
        this.beam.visible = false;
        if (this.targetBuilding.laserTimer >= BOSS_LASER_DURATION - 0.05 && !this.targetBuilding.isProtected) {
          this.targetBuilding.collapse();
          if (onBuildingCollapse) onBuildingCollapse(this.targetBuilding);
        }
        this.targetBuilding.resetLaserExposure();
        this.targetBuilding = null;
        this.state = 'idle';
        this.timeToNextAttack = BOSS_LASER_INTERVAL;
      }
    }
  }

  _aimBeamAt(targetPos) {
    const from = this.eyePosition;
    const to = new THREE.Vector3(targetPos.x, 0.5, targetPos.z);
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    this.beam.position.copy(from);
    this.beam.scale.set(1, 1, dist);
    this.beam.lookAt(to);
  }
}

export function spawnMinions(scene, count = MINION_COUNT) {
  const minions = [];
  for (let i = 0; i < count; i++) {
    const x = randRange(CITY_BOUNDS.minX + 15, CITY_BOUNDS.maxX - 15);
    const z = randRange(RIVER_HALF_WIDTH + 12, CITY_BOUNDS.maxZ - 15);
    minions.push(new Minion(scene, { x, z }, 'imp'));
  }
  return minions;
}

export function spawnBonusMinions(scene, pos, kind, count) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = pos.x + Math.cos(angle) * 4;
    const z = pos.z + Math.sin(angle) * 4;
    list.push(new Minion(scene, { x, z }, kind));
  }
  return list;
}

// Monsters that pour in through a broken apartment window: confined to
// wander only within that interior instead of heading off toward the city.
export function spawnInteriorMinions(scene, pos, interiorId, count = 2) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = pos.x + Math.cos(angle) * 2;
    const z = pos.z + Math.sin(angle) * 2;
    const m = new Minion(scene, { x, z }, 'imp', { cx: pos.x, cz: pos.z, radius: 6 });
    m.homeInteriorId = interiorId;
    list.push(m);
  }
  return list;
}
