import * as THREE from 'three';
import './style.css';
import { COLORS, RIVER_HALF_WIDTH, BRIDGE_HALF_WIDTH, BRIDGE_HALF_LENGTH, BRIDGE_DECK_Y, PLAYER_START } from './game/constants.js';
import { buildCity } from './game/City.js';
import { Player } from './game/Player.js';
import { InputManager } from './game/InputManager.js';
import { spawnCars } from './game/Cars.js';
import { Boss, spawnMinions, spawnBonusMinions } from './game/Enemies.js';
import { ItemSystem, ITEM_ORDER } from './game/Items.js';
import { UI } from './game/UI.js';

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

let minions = spawnMinions(scene);
const boss = new Boss(scene, buildings);
let bonusEnemies = [];

function getAllEnemies() {
  return [...minions, boss, ...bonusEnemies];
}

const ui = new UI();
const itemSystem = new ItemSystem(scene, player, getAllEnemies, buildings, ui);

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

ui.onStart(() => {
  ui.hideStart();
  input.requestPointerLock();
  state.running = true;
});
canvas.addEventListener('click', () => {
  if (state.running) input.requestPointerLock();
});
ui.onRestart(() => window.location.reload());

function updateBuildingAndCarAccess() {
  if (player.mountedCar || player.onRooftopId) return;
  for (const b of buildings) {
    if (b.isCollapsed || b.isCollapsing) continue;
    const dx = player.position.x - b.entranceWorldPos.x;
    const dz = player.position.z - b.entranceWorldPos.z;
    if (Math.hypot(dx, dz) < 3.5) {
      player.onRooftopId = b.id;
      player.group.position.set(b.pos.x, b.height + 1.6, b.pos.z);
      ui.toast(`${b.name} 옥상으로 이동!`);
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
    endGame(false);
  }
}

function endGame(won) {
  if (state.won !== null) return;
  state.won = won;
  state.running = false;
  document.exitPointerLock();
  ui.showEnd(won);
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (state.running) {
    player.update(dt, world);
    updateBuildingAndCarAccess();

    for (const car of cars) car.update(dt);

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
  scene.background = day.clone().lerp(night, t);
  const fogDay = new THREE.Color(COLORS.fog);
  const fogNight = new THREE.Color(COLORS.fogNight);
  scene.fog.color = fogDay.clone().lerp(fogNight, t);
}

animate();

if (import.meta.env.DEV) {
  window.__game = { player, minions: () => minions, bonusEnemies: () => bonusEnemies, boss, cars, buildings, itemSystem, state };
}
