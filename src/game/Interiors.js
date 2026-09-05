import * as THREE from 'three';
import {
  INTERIOR_ORIGINS, UNITS_PER_JANGMI, WINDOW_BREAK_TIME_MIN, WINDOW_BREAK_TIME_MAX,
} from './constants.js';
import { makeTextLabel, randRange } from './utils.js';

const CORRIDOR_LEN = 26;
const UNIT_SPACING = CORRIDOR_LEN / UNITS_PER_JANGMI;

function buildChildMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 8), shirt);
  body.position.y = 0.55;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 0.95;
  g.add(head);
  return g;
}

function buildWindowMesh() {
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.2, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.55 })
  );
  return frame;
}

// One Jangmi Apartment building's interior: a corridor with 호0~호3 units,
// each holding a child behind a window monsters slowly threaten.
function buildJangmiInterior(scene, building) {
  const origin = INTERIOR_ORIGINS[building.id];
  const originVec = new THREE.Vector3(origin.x, 0, origin.z);
  const group = new THREE.Group();
  group.position.copy(originVec);
  scene.add(group);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0xcac0b0, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe5ded0, roughness: 0.85 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, CORRIDOR_LEN + 6), floorMat);
  floor.position.set(0, -0.15, CORRIDOR_LEN / 2);
  group.add(floor);

  const ceiling = floor.clone();
  ceiling.position.y = 3.2;
  group.add(ceiling);

  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, CORRIDOR_LEN + 6), wallMat);
    wall.position.set(side * 3, 1.6, CORRIDOR_LEN / 2);
    group.add(wall);
  }

  const label = makeTextLabel(`${building.name} 내부`, { color: '#ffffff' });
  label.position.set(0, 3.6, -1.5);
  group.add(label);

  const units = [];
  for (let i = 0; i < UNITS_PER_JANGMI; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = 3 + Math.floor(i / 2) * (UNIT_SPACING * 2) + 4;
    const roomLocal = new THREE.Vector3(side * 6, 0, z);

    const room = new THREE.Group();
    room.position.copy(roomLocal);
    group.add(room);

    const roomFloor = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 5), floorMat);
    room.add(roomFloor);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), wallMat);
    backWall.position.set(0, 1.5, side * 2.5);
    room.add(backWall);

    const doorLabel = makeTextLabel(`${i}호`, { color: '#ffe082', bg: 'rgba(40,30,10,0.55)', fontSize: 44 });
    doorLabel.position.set(0, 2.6, -side * 2.4);
    room.add(doorLabel);

    const window = buildWindowMesh();
    window.position.set(0, 1.6, side * 2.55);
    room.add(window);

    const child = buildChildMesh();
    child.position.set(0, 0, side * 1.2);
    room.add(child);

    units.push({
      index: i,
      childAlive: true,
      childRescued: false,
      childMesh: child,
      window,
      windowBroken: false,
      windowTimer: randRange(WINDOW_BREAK_TIME_MIN, WINDOW_BREAK_TIME_MAX),
      // world-space position of the child/room, used for pickup checks and
      // for spawning monsters into the corridor when a window breaks.
      worldPos: originVec.clone().add(roomLocal),
      corridorWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, roomLocal.z)),
    });
  }

  // Elevator pad -> roof, exit pad -> back outside.
  const elevatorPad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0x66c9ff, emissive: 0x144466, emissiveIntensity: 0.5 })
  );
  elevatorPad.position.set(0, 0.1, CORRIDOR_LEN + 2);
  group.add(elevatorPad);
  const elevatorLabel = makeTextLabel('옥상으로', { color: '#ffffff', fontSize: 36 });
  elevatorLabel.position.set(0, 1.6, CORRIDOR_LEN + 2);
  group.add(elevatorLabel);

  const exitPad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x554400, emissiveIntensity: 0.5 })
  );
  exitPad.position.set(0, 0.1, 0);
  group.add(exitPad);
  const exitLabel = makeTextLabel('밖으로', { color: '#ffffff', fontSize: 36 });
  exitLabel.position.set(0, 1.6, 0);
  group.add(exitLabel);

  return {
    id: building.id,
    building,
    group,
    origin: originVec,
    units,
    spawnWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, 5)),
    elevatorWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, CORRIDOR_LEN + 2)),
    exitWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, 0)),
  };
}

function buildBelugaNpc() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.5 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1, 4, 10), mat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.8;
  g.add(body);
  const melon = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), mat);
  melon.position.set(0.7, 0.95, 0);
  g.add(melon);
  return g;
}

// Lotte Tower's interior: an open hall with friendly, bouncy belugas that
// follow the player around. This also doubles as the "safe" arrival point
// when the star item's wish saves the player from drowning in the river.
function buildLotteInterior(scene, building) {
  const origin = INTERIOR_ORIGINS.lotte;
  const originVec = new THREE.Vector3(origin.x, 0, origin.z);
  const group = new THREE.Group();
  group.position.copy(originVec);
  scene.add(group);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.4, metalness: 0.1 });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.3, 24), floorMat);
  floor.position.y = -0.15;
  group.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xdfe7f2, roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 6, 24, 1, true), wallMat);
  wall.position.y = 3;
  group.add(wall);

  const label = makeTextLabel(`${building.name} 로비`, { color: '#ffffff' });
  label.position.set(0, 5, -8);
  group.add(label);

  const exitPad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x554400, emissiveIntensity: 0.5 })
  );
  exitPad.position.set(0, 0.1, 10);
  group.add(exitPad);
  const exitLabel = makeTextLabel('밖으로', { color: '#ffffff', fontSize: 36 });
  exitLabel.position.set(0, 1.8, 10);
  group.add(exitLabel);

  const elevatorPad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 0.15, 16),
    new THREE.MeshStandardMaterial({ color: 0x66c9ff, emissive: 0x144466, emissiveIntensity: 0.5 })
  );
  elevatorPad.position.set(0, 0.1, -10);
  group.add(elevatorPad);
  const elevatorLabel = makeTextLabel('옥상으로', { color: '#ffffff', fontSize: 36 });
  elevatorLabel.position.set(0, 1.8, -10);
  group.add(elevatorLabel);

  const belugas = [];
  for (let i = 0; i < 4; i++) {
    const mesh = buildBelugaNpc();
    const angle = (i / 4) * Math.PI * 2;
    mesh.position.set(Math.cos(angle) * 6, 0, Math.sin(angle) * 6);
    group.add(mesh);
    belugas.push({ mesh, phase: Math.random() * Math.PI * 2 });
  }

  return {
    id: 'lotte',
    building,
    group,
    origin: originVec,
    belugas,
    spawnWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, 4)),
    wishArrivalWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, 0)),
    elevatorWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, -10)),
    exitWorldPos: originVec.clone().add(new THREE.Vector3(0, 0, 10)),
  };
}

export function buildInteriors(scene, buildingsById) {
  const jangmiInteriors = {};
  for (const id of ['jangmi1', 'jangmi2', 'jangmi3']) {
    jangmiInteriors[id] = buildJangmiInterior(scene, buildingsById[id]);
  }
  const lotteInterior = buildLotteInterior(scene, buildingsById.lotte);
  return { jangmiInteriors, lotteInterior };
}

// Animates belugas bouncing and drifting loosely toward the player.
export function updateLotteInterior(interior, dt, playerInsideLotte, playerLocalPos) {
  for (const b of interior.belugas) {
    b.phase += dt * 3;
    b.mesh.position.y = Math.abs(Math.sin(b.phase)) * 0.8;
    b.mesh.rotation.y += dt * 0.5;
    if (playerInsideLotte) {
      const dx = playerLocalPos.x - b.mesh.position.x;
      const dz = playerLocalPos.z - b.mesh.position.z;
      const d = Math.hypot(dx, dz);
      if (d > 3) {
        b.mesh.position.x += (dx / d) * dt * 1.5;
        b.mesh.position.z += (dz / d) * dt * 1.5;
      }
    }
  }
}

// Ticks every Jangmi unit's window-break countdown. Returns a list of units
// whose windows broke this frame (caller spawns monsters + marks children lost).
export function updateJangmiInterior(interior, dt) {
  const brokenNow = [];
  for (const unit of interior.units) {
    if (unit.windowBroken || unit.childRescued || !unit.childAlive) continue;
    unit.windowTimer -= dt;
    const urgency = 1 - Math.max(0, unit.windowTimer) / WINDOW_BREAK_TIME_MAX;
    unit.window.material.color.setRGB(0.55 + urgency * 0.4, 0.6 - urgency * 0.5, 0.67 - urgency * 0.6);
    if (unit.windowTimer <= 0) {
      unit.windowBroken = true;
      unit.childAlive = false;
      unit.window.material.opacity = 0.15;
      unit.window.material.color.set(0x222222);
      unit.childMesh.visible = false;
      brokenNow.push(unit);
    }
  }
  return brokenNow;
}
