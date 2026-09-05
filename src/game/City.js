import * as THREE from 'three';
import {
  COLORS, RIVER_HALF_WIDTH, BRIDGE_HALF_LENGTH, BRIDGE_DECK_Y, BRIDGE_HALF_WIDTH,
  BUILDING_DEFS, MOUNTAIN_POS, MOUNTAIN_RADIUS, MOUNTAIN_HEIGHT, ROAD_LOOP, CITY_BOUNDS,
} from './constants.js';
import { Building } from './Building.js';
import { makeTextLabel } from './utils.js';

// Builds all static world geometry (ground, river, bridge, roads, mountain)
// and the set of defensible Building instances. Returns everything the rest
// of the game needs to reason about the world.
export function buildCity(scene) {
  const buildings = BUILDING_DEFS.map((def) => new Building(def));
  for (const b of buildings) scene.add(b.group);

  addLighting(scene);
  addGround(scene);
  addRiverAndBridge(scene);
  addRoads(scene);
  const mountain = addMountain(scene);
  decorateCity(scene, buildings);

  return { buildings, mountain, roadLoop: ROAD_LOOP };
}

function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(COLORS.sky, COLORS.ground, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(120, 220, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0015;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}

function addGround(scene) {
  const geo = new THREE.PlaneGeometry(2000, 2000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.position.y = 0;
  scene.add(mesh);
}

function addRiverAndBridge(scene) {
  // Han River flowing east-west beneath the bridge.
  const riverGeo = new THREE.PlaneGeometry(2000, RIVER_HALF_WIDTH * 2);
  riverGeo.rotateX(-Math.PI / 2);
  const riverMat = new THREE.MeshStandardMaterial({
    color: COLORS.river, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.92,
  });
  const river = new THREE.Mesh(riverGeo, riverMat);
  river.position.y = 0.05;
  scene.add(river);

  // Jamsil Bridge deck spanning north-south across the river, plus piers.
  const deckGeo = new THREE.BoxGeometry(BRIDGE_HALF_WIDTH * 2, 0.6, BRIDGE_HALF_LENGTH * 2 + 6);
  const deckMat = new THREE.MeshStandardMaterial({ color: COLORS.bridgeDeck, roughness: 0.8 });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.set(0, BRIDGE_DECK_Y, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  scene.add(deck);

  const railMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.6 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, BRIDGE_HALF_LENGTH * 2 + 6), railMat);
    rail.position.set(side * (BRIDGE_HALF_WIDTH - 0.2), BRIDGE_DECK_Y + 1, 0);
    scene.add(rail);
  }

  const pierMat = new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.9 });
  for (let z = -RIVER_HALF_WIDTH + 8; z <= RIVER_HALF_WIDTH - 8; z += 16) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(3, BRIDGE_DECK_Y + 1, 3), pierMat);
    pier.position.set(0, (BRIDGE_DECK_Y) / 2, z);
    scene.add(pier);
  }

  const label = makeTextLabel('잠실대교', { color: '#ffffff' });
  label.position.set(0, BRIDGE_DECK_Y + 6, 0);
  scene.add(label);

  scene.userData.riverZBounds = [-RIVER_HALF_WIDTH, RIVER_HALF_WIDTH];
}

function addRoads(scene) {
  const roadMat = new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 1 });
  for (let i = 0; i < ROAD_LOOP.length; i++) {
    const a = ROAD_LOOP[i];
    const b = ROAD_LOOP[(i + 1) % ROAD_LOOP.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(9, len), roadMat);
    seg.rotateX(-Math.PI / 2);
    seg.rotation.z = -angle;
    seg.position.set((a.x + b.x) / 2, 0.06, (a.z + b.z) / 2);
    seg.receiveShadow = true;
    scene.add(seg);
  }
}

function addMountain(scene) {
  const group = new THREE.Group();
  group.position.set(MOUNTAIN_POS.x, 0, MOUNTAIN_POS.z);

  const base = new THREE.Mesh(
    new THREE.ConeGeometry(MOUNTAIN_RADIUS, MOUNTAIN_HEIGHT, 7),
    new THREE.MeshStandardMaterial({ color: COLORS.mountain, roughness: 1, flatShading: true })
  );
  base.position.y = MOUNTAIN_HEIGHT / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(MOUNTAIN_RADIUS * 0.4, MOUNTAIN_HEIGHT * 0.35, 7),
    new THREE.MeshStandardMaterial({ color: COLORS.mountainSnow, roughness: 1, flatShading: true })
  );
  cap.position.y = MOUNTAIN_HEIGHT * 0.88;
  group.add(cap);

  scene.add(group);

  const label = makeTextLabel('괴수의 산', { color: '#ffdada', bg: 'rgba(60,0,0,0.5)' });
  label.position.set(0, MOUNTAIN_HEIGHT + 12, 0);
  group.add(label);

  return { group, pos: new THREE.Vector3(MOUNTAIN_POS.x, 0, MOUNTAIN_POS.z), radius: MOUNTAIN_RADIUS };
}

// Scatter simple low-poly trees / props so the city doesn't feel empty.
function decorateCity(scene, buildings) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3f, roughness: 1 });
  const rng = mulberry32(1234);

  let placed = 0;
  let attempts = 0;
  while (placed < 70 && attempts < 2000) {
    attempts++;
    const x = CITY_BOUNDS.minX + rng() * (CITY_BOUNDS.maxX - CITY_BOUNDS.minX);
    const z = CITY_BOUNDS.minZ + rng() * (CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ);
    if (Math.abs(z) < RIVER_HALF_WIDTH + 6) continue;
    if (Math.hypot(x - MOUNTAIN_POS.x, z - MOUNTAIN_POS.z) < MOUNTAIN_RADIUS + 15) continue;
    let tooClose = false;
    for (const b of buildings) {
      if (Math.hypot(x - b.pos.x, z - b.pos.z) < b.radius + 8) { tooClose = true; break; }
    }
    if (tooClose) continue;

    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3, 6), trunkMat);
    trunk.position.y = 1.5;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(2.2, 7, 6), leafMat);
    leaf.position.y = 3.6;
    tree.add(trunk, leaf);
    tree.position.set(x, 0, z);
    tree.castShadow = true;
    scene.add(tree);
    placed++;
  }
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
