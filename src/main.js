import * as THREE from 'three';
import './style.css';
import {
  COLORS, RIVER_HALF_WIDTH, BRIDGE_HALF_WIDTH, BRIDGE_HALF_LENGTH, BRIDGE_DECK_Y, PLAYER_START,
  UNITS_PER_JANGMI, CHILD_PICKUP_RADIUS, CHILD_DELIVER_RADIUS,
} from './game/constants.js';
import { buildCity } from './game/City.js';
import { Player } from './game/Player.js';
import { InputManager } from './game/InputManager.js';
import { spawnCars, createTrafficLights, updateCars } from './game/Cars.js';
import { Boss, spawnMinions, spawnBonusMinions, spawnInteriorMinions } from './game/Enemies.js';
import { ItemSystem, ITEM_ORDER } from './game/Items.js';
import { UI } from './game/UI.js';
import { buildInteriors, updateJangmiInterior, updateLotteInterior } from './game/Interiors.js';
import { dist2D } from './game/utils.js';

const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.fog, 120, 520);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 12, -18);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setSize(window.innerWidth, window.innerHeight);

const { buildings, roadLoop } = buildCity(scene);
const buildingsById = Object.fromEntries(buildings.map((b) => [b.id, b]));
const interiors = buildInteriors(scene, buildingsById);

const input = new InputManager(canvas);
const player = new Player(scene, input, buildingsById);
player.group.position.set(PLAYER_START.x, PLAYER_START.y, PLAYER_START.z);

const world = {
  riverZBounds: [-RIVER_HALF_WIDTH, RIVER_HALF_WIDTH],
  bridgeHalfWidth: BRIDGE_HALF_WIDTH,
  bridgeHalfLength: BRIDGE_HALF_LENGTH,
  bridgeDeckY: BRIDGE_DECK_Y,
  buildingsById,
};

const cars = spawnCars(scene, roadLoop, 8);
const trafficLights = createTrafficLights(roadLoop);
for (const light of trafficLights) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  pole.position.set(light.pos.x + 4, 1.6, light.pos.z);
  scene.add(pole);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff3030, emissiveIntensity: 1 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), lampMat);
  lamp.position.set(light.pos.x + 4, 3.4, light.pos.z);
  scene.add(lamp);
  light.lampMat = lampMat;
}

let minions = spawnMinions(scene);
const boss = new Boss(scene, buildings);
let bonusEnemies = [];

function getAllEnemies() {
  return [...minions, boss, ...bonusEnemies];
}

const ui = new UI();
const itemSystem = new ItemSystem(scene, player, getAllEnemies, buildings, ui, interiors);

const TOTAL_CHILDREN = 3 * UNITS_PER_JANGMI;
let rescuedCount = 0;
ui.setRescueCount(rescuedCount, TOTAL_CHILDREN);

const state = { running: false, won: null };

input.onDigit = (n) => {
  if (!state.running) return;
  const type = ITEM_ORDER[n - 1];
  if (type) itemSystem.equip(type);
};
input.onEnter = () => {
  if (!state.running) return;
  itemSystem.useHeld();
};
input.onCtrl = () => {
  if (!state.running) return;
  tryPickUpChild();
};

ui.onStart(() => {
  ui.hideStart();
  input.requestPointerLock();
  state.running = true;
});
canvas.addEventListener('click', () => {
  if (state.running) input.requestPointerLock();
});
ui.onRestart(() => window.location.reload());

// --- Entrances: Jangmi/Lotte lead inside; Hyanggun/Samsung CDS go straight to the roof ---
function updateBuildingAndCarAccess() {
  if (player.mountedCar || player.onRooftopId || player.interiorId) return;
  for (const b of buildings) {
    if (b.isCollapsed || b.isCollapsing) continue;
    const dx = player.position.x - b.entranceWorldPos.x;
    const dz = player.position.z - b.entranceWorldPos.z;
    if (Math.hypot(dx, dz) < 3.5) {
      if (b.kind === 'jangmi' || b.kind === 'lotte') {
        const interior = b.kind === 'jangmi' ? interiors.jangmiInteriors[b.id] : interiors.lotteInterior;
        player.enterInterior(b.id, interior.spawnWorldPos);
        ui.toast(`${b.name} 안으로 들어왔다`);
      } else {
        player.onRooftopId = b.id;
        player.group.position.set(b.pos.x, b.height + 1.6, b.pos.z);
        ui.toast(`${b.name} 옥상으로 이동!`);
      }
      return;
    }
  }
  for (const car of cars) {
    const dx = player.position.x - car.group.position.x;
    const dz = player.position.z - car.group.position.z;
    if (Math.hypot(dx, dz) < 2.6) {
      player.mountCar(car);
      return;
    }
  }
}

// --- Interior elevator (-> roof) / exit (-> outside) pads ---
function updateInteriorAccess(dt) {
  if (!player.interiorId) return;
  const isLotte = player.interiorId === 'lotte';
  const interior = isLotte ? interiors.lotteInterior : interiors.jangmiInteriors[player.interiorId];
  const building = buildingsById[player.interiorId];

  const dxElev = player.position.x - interior.elevatorWorldPos.x;
  const dzElev = player.position.z - interior.elevatorWorldPos.z;
  if (Math.hypot(dxElev, dzElev) < 2) {
    player.interiorId = null;
    player.onRooftopId = building.id;
    player.group.position.set(building.pos.x, building.height + 1.6, building.pos.z);
    ui.toast(`${building.name} 옥상으로 이동!`);
    return;
  }

  const dxExit = player.position.x - interior.exitWorldPos.x;
  const dzExit = player.position.z - interior.exitWorldPos.z;
  if (Math.hypot(dxExit, dzExit) < 2) {
    // Land a bit further out than the entrance pad itself, otherwise
    // walking out would immediately re-trigger walking back in.
    const landing = building.entranceWorldPos.clone().add(new THREE.Vector3(0, 0, 6));
    player.exitInterior(landing);
    ui.toast(`${building.name} 밖으로 나왔다`);
    return;
  }

  if (isLotte) {
    const localPos = player.position.clone().sub(interior.origin);
    updateLotteInterior(interior, dt, true, localPos);
  } else {
    const broken = updateJangmiInterior(interior, dt);
    for (const unit of broken) {
      bonusEnemies.push(...spawnInteriorMinions(scene, unit.corridorWorldPos, interior.id, 2));
      ui.toast(`${unit.index}호 창문이 깨졌다!`);
    }
  }
}

// Ticks window timers even for Jangmi interiors the player is NOT currently
// standing in, so a child can be lost while you're elsewhere.
function updateOffscreenInteriors(dt) {
  for (const id of Object.keys(interiors.jangmiInteriors)) {
    if (player.interiorId === id) continue;
    const interior = interiors.jangmiInteriors[id];
    const broken = updateJangmiInterior(interior, dt);
    for (const unit of broken) {
      bonusEnemies.push(...spawnInteriorMinions(scene, unit.corridorWorldPos, interior.id, 2));
    }
  }
  if (player.interiorId !== 'lotte') {
    updateLotteInterior(interiors.lotteInterior, dt, false, player.position);
  }
}

function tryPickUpChild() {
  if (player.carriedChild) return;
  if (!player.interiorId || player.interiorId === 'lotte') return;
  const interior = interiors.jangmiInteriors[player.interiorId];
  for (const unit of interior.units) {
    if (!unit.childAlive || unit.childRescued || unit.windowBroken) continue;
    if (dist2D(player.position.x, player.position.z, unit.worldPos.x, unit.worldPos.z) < CHILD_PICKUP_RADIUS) {
      unit.childRescued = true;
      player.carryChild({ mesh: unit.childMesh, unitId: `${interior.id}-${unit.index}` });
      ui.toast(`${unit.index}호 아이를 안았다! 안전한 차로 데려가자`);
      return;
    }
  }
}

function updateChildDelivery() {
  if (!player.carriedChild || player.interiorId) return;
  for (const car of cars) {
    if (dist2D(player.position.x, player.position.z, car.group.position.x, car.group.position.z) < CHILD_DELIVER_RADIUS) {
      player.releaseCarriedChild();
      rescuedCount += 1;
      ui.setRescueCount(rescuedCount, TOTAL_CHILDREN);
      ui.toast('아이를 구출했다! 아이가 차를 몰고 떠난다');
      car.boostAway?.();
      return;
    }
  }
}

function onBuildingCollapse(building) {
  ui.toast(`${building.name}가 무너졌다!`);
  if (building.kind === 'jangmi') {
    bonusEnemies.push(...spawnBonusMinions(scene, building.pos, 'snail', 6));
    ui.toast('달팽이들이 쏟아져 나온다!');
  } else if (building.kind === 'lotte') {
    bonusEnemies.push(...spawnBonusMinions(scene, building.pos, 'beluga', 5));
    ui.toast('벨루가들이 쏟아져 나온다!');
  }
  if (buildings.every((b) => b.isCollapsed || b.isCollapsing)) {
    endGame(false, 'buildings');
  }
}

function endGame(won, reason = 'buildings') {
  if (state.won !== null) return;
  state.won = won;
  state.running = false;
  document.exitPointerLock();
  ui.showEnd(won, reason);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (state.running) {
    player.update(dt, world);
    updateBuildingAndCarAccess();
    updateInteriorAccess(dt);
    updateOffscreenInteriors(dt);
    updateChildDelivery();

    if (player.fallingInRiver) {
      ui.showDanger();
      ui.setDangerProgress(player.fallGraceTimer / 3);
    } else {
      ui.hideDanger();
    }
    if (player.diedInRiver) {
      player.diedInRiver = false;
      endGame(false, 'river');
    }

    updateCars(cars, dt, trafficLights, player.mountedCar);
    for (const light of trafficLights) {
      const color = light.state === 'red' ? 0xff3030 : 0x30ff5a;
      light.lampMat.color.set(color);
      light.lampMat.emissive.set(color);
    }

    for (const m of minions) m.update(dt, player);
    for (const m of bonusEnemies) m.update(dt, player);
    minions = minions.filter((m) => m.alive || !disposeIfDead(m, scene));
    bonusEnemies = bonusEnemies.filter((m) => m.alive || !disposeIfDead(m, scene));

    const minionsNearPlayer = itemSystem.countMinionsNear(player.position.x, player.position.z, 6);
    boss.update(dt, {
      buildings,
      player,
      minionsNearPlayer,
      onBuildingCollapse,
      onShieldBreak: () => itemSystem.onShieldBreak(),
    });
    for (const b of buildings) b.update(dt);

    itemSystem.update(dt);
    applySky();

    ui.setHealth(player.hp, player.maxHp);
    const aliveMinions = minions.filter((m) => m.alive).length;
    ui.setMonsterCount(aliveMinions + (boss.alive ? 1 : 0));

    let bossProgress;
    if (boss.state === 'idle') bossProgress = 1 - boss.timeToNextAttack / 30;
    else if (boss.state === 'telegraph') bossProgress = 1;
    else bossProgress = 1 - boss.firingTimer / 3;
    ui.setBossTimer(boss.state, bossProgress);

    if (!boss.alive && aliveMinions === 0 && state.won === null) endGame(true);
  }

  player.updateCamera(camera, world);
  renderer.render(scene, camera);
}

function disposeIfDead(enemy, scene) {
  if (!enemy.alive) {
    enemy.dispose(scene);
    return true;
  }
  return false;
}

function applySky() {
  const t = itemSystem.skyDarkT;
  const day = new THREE.Color(COLORS.sky);
  const night = new THREE.Color(COLORS.skyNight);
  let color = day.clone().lerp(night, t);
  let fogColor = new THREE.Color(COLORS.fog).lerp(new THREE.Color(COLORS.fogNight), t);

  if (itemSystem.wishFlashT > 0) {
    const flashT = Math.min(1, itemSystem.wishFlashT / 1.4);
    const bright = new THREE.Color(0xfff6d8);
    color = color.lerp(bright, flashT);
    fogColor = fogColor.lerp(bright, flashT);
  }

  scene.background = color;
  scene.fog.color = fogColor;
}

animate();

if (import.meta.env.DEV) {
  window.__game = {
    player, minions: () => minions, bonusEnemies: () => bonusEnemies, boss, cars, buildings, itemSystem, state, interiors,
  };
}
