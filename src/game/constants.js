// Shared layout & tuning constants for the whole game.

export const COLORS = {
  sky: 0x8fd3ff,
  skyNight: 0x0a0c1a,
  fog: 0x9fd8ff,
  fogNight: 0x0a0c1a,
  ground: 0x5b8a4f,
  road: 0x3a3d42,
  river: 0x2f6fb3,
  bridgeDeck: 0x8a8f98,
  lotteTower: 0xd7d9e0,
  jangmiApt: 0xe08a9a,
  hyanggunTower: 0xb08d57,
  samsungCds: 0x3f7fd1,
  mountain: 0x6b6558,
  mountainSnow: 0x4a4640,
  bossRed: 0xb3121f,
  bossGlow: 0xff2b2b,
  ash: 0x2a2622,
};

// World layout (X = east/west, Z = south/north, Y = up)
export const RIVER_Z = 0; // river centerline
export const RIVER_HALF_WIDTH = 26;
export const BRIDGE_HALF_LENGTH = 34; // spans across the river along Z
export const BRIDGE_DECK_Y = 3.2;
export const BRIDGE_HALF_WIDTH = 6;

export const PLAYER_START = { x: 0, y: BRIDGE_DECK_Y + 1.1, z: 0 };

export const CITY_BOUNDS = { minX: -170, maxX: 200, minZ: -60, maxZ: 220 };

export const BUILDING_DEFS = [
  { id: 'lotte', name: '롯데타워', kind: 'lotte', pos: { x: 70, z: 110 }, height: 95, radius: 11, color: COLORS.lotteTower },
  { id: 'jangmi1', name: '장미아파트 1동', kind: 'jangmi', pos: { x: -70, z: 95 }, height: 32, radius: 9, color: COLORS.jangmiApt },
  { id: 'jangmi2', name: '장미아파트 2동', kind: 'jangmi', pos: { x: -50, z: 115 }, height: 30, radius: 9, color: COLORS.jangmiApt },
  { id: 'jangmi3', name: '장미아파트 3동', kind: 'jangmi', pos: { x: -85, z: 125 }, height: 34, radius: 9, color: COLORS.jangmiApt },
  { id: 'hyanggun', name: '향군타워', kind: 'hyanggun', pos: { x: 10, z: 150 }, height: 55, radius: 10, color: COLORS.hyanggunTower },
  { id: 'samsungcds', name: '삼성 CDS타워', kind: 'samsungcds', pos: { x: 120, z: 60 }, height: 48, radius: 10, color: COLORS.samsungCds },
];

// Respawn point: on top of the first Jangmi apartment building.
export const RESPAWN_BUILDING_ID = 'jangmi1';

export const MOUNTAIN_POS = { x: 165, z: 175 };
export const MOUNTAIN_RADIUS = 60;
export const MOUNTAIN_HEIGHT = 95;
export const BOSS_SPAWN = { x: 150, z: 140 };

// All waypoints stay north of the river (z > RIVER_HALF_WIDTH) so cars never
// drive through the Han River itself — only the player can cross via the bridge.
export const ROAD_LOOP = [
  { x: -40, z: 32 },
  { x: -130, z: 40 },
  { x: -110, z: 150 },
  { x: -10, z: 175 },
  { x: 90, z: 160 },
  { x: 160, z: 90 },
  { x: 150, z: 40 },
  { x: 40, z: 32 },
];

export const TOTAL_MONSTERS = 50; // boss (1) + minions (49)
export const MINION_COUNT = TOTAL_MONSTERS - 1;

export const BOSS_MAX_HP = 50;
export const BOSS_LASER_INTERVAL = 30; // seconds
export const BOSS_LASER_TELEGRAPH = 1; // seconds of warning before beam fires
export const BOSS_LASER_DURATION = 3; // seconds of sustained beam -> collapse

export const PLAYER_MAX_HP = 100;

export const ITEM_TYPES = {
  arrow: { label: '화살', icon: '🏹' },
  shield: { label: '방패', icon: '🛡️' },
  star: { label: '별', icon: '🌠' },
  sword: { label: '칼', icon: '🗡️' },
};

export const METEOR_SHOWER_DURATION = 9; // seconds
export const SHIELD_DURATION = 15; // seconds before it naturally fades
export const SWORD_RANGE = 6;
