import * as THREE from 'three';
import { CITY_BOUNDS, RIVER_HALF_WIDTH, METEOR_SHOWER_DURATION, SHIELD_DURATION, SWORD_RANGE } from './constants.js';
import { dist2D, randRange, clamp } from './utils.js';

export const ITEM_ORDER = ['arrow', 'shield', 'star', 'sword'];
const ITEM_DAMAGE_TO_BOSS = { arrow: 1, sword: 2, meteor: 8 };
const WISH_FLASH_DURATION = 1.4;

const PICKUP_SPOTS = [
  { x: -20, z: 40, type: 'arrow' }, { x: 30, z: 55, type: 'arrow' }, { x: -60, z: 140, type: 'arrow' },
  { x: 90, z: 120, type: 'arrow' }, { x: 140, z: 100, type: 'arrow' },
  { x: 10, z: 80, type: 'shield' }, { x: -100, z: 90, type: 'shield' }, { x: 60, z: 150, type: 'shield' },
  { x: -30, z: 170, type: 'star' }, { x: 100, z: 40, type: 'star' }, { x: 130, z: 160, type: 'star' },
  { x: -70, z: 60, type: 'sword' }, { x: 40, z: 100, type: 'sword' }, { x: -20, z: 190, type: 'sword' },
];

function buildPickupMesh(type) {
  const group = new THREE.Group();
  if (type === 'arrow') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.5 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), mat);
    shaft.rotation.z = Math.PI / 2;
    group.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.35, 8), new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.3 }));
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.85;
    group.add(tip);
  } else if (type === 'shield') {
    const mat = new THREE.MeshStandardMaterial({ color: 0x66c9ff, transparent: true, opacity: 0.55, metalness: 0.1, roughness: 0.15, emissive: 0x1155aa, emissiveIntensity: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 10, 20), mat);
    group.add(ring);
    const web = new THREE.Mesh(new THREE.CircleGeometry(0.5, 16), new THREE.MeshBasicMaterial({ color: 0x99e0ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    group.add(web);
  } else if (type === 'star') {
    const mat = new THREE.MeshStandardMaterial({ color: 0xfff08a, emissive: 0xbba61a, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.3 });
    const star = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat);
    group.add(star);
  } else {
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd6d9e0, metalness: 0.7, roughness: 0.25 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.28), bladeMat);
    blade.position.y = 0.5;
    group.add(blade);
    const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.16), new THREE.MeshStandardMaterial({ color: 0x5a3a20 }));
    hilt.position.y = -0.15;
    group.add(hilt);
  }
  return group;
}

class ItemPickup {
  constructor(scene, pos, type) {
    this.type = type;
    this.collected = false;
    this.mesh = buildPickupMesh(type);
    this.mesh.position.set(pos.x, 1.4, pos.z);
    scene.add(this.mesh);

    const glow = new THREE.PointLight(0xffffff, 0.6, 6);
    glow.position.set(pos.x, 1.6, pos.z);
    scene.add(glow);
    this.glow = glow;
  }

  update(dt) {
    this.mesh.rotation.y += dt * 1.6;
    this.mesh.position.y = 1.4 + Math.sin(performance.now() * 0.003 + this.mesh.position.x) * 0.15;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    scene.remove(this.glow);
  }
}

function buildHeldItemMesh(type) {
  const m = buildPickupMesh(type);
  m.scale.setScalar(type === 'sword' ? 1.1 : 0.9);
  return m;
}

// Handles world pickups, the player's bag, the currently-equipped item, and
// every item-use effect (arrow / shield / meteor shower / sword).
export class ItemSystem {
  constructor(scene, player, enemyGetter, buildings, ui, interiors) {
    this.scene = scene;
    this.player = player;
    this.getEnemies = enemyGetter; // () => [minions..., boss]
    this.buildings = buildings;
    this.ui = ui;
    this.interiors = interiors;

    this.bag = { arrow: 2, shield: 1, star: 1, sword: 1 };
    this.held = null;

    this.pickups = PICKUP_SPOTS.map((s) => new ItemPickup(scene, s, s.type));
    this.projectiles = [];
    this.meteors = [];
    this.meteorShowerTimer = 0;
    this.skyDarkT = 0; // 0..1 blend toward night sky during star event
    this.wishFlashT = 0; // >0 briefly brightens the sky when the wish saves the player

    this.swordSwingFlash = 0;

    ui.updateInventory(this.bag, this.held);
  }

  equip(type) {
    if (this.held === type) {
      this.bag[type] += 1;
      this._removeHandMesh();
      this.held = null;
      this.ui.updateInventory(this.bag, this.held);
      return;
    }
    if (this.held) {
      this.bag[this.held] += 1;
      this._removeHandMesh();
      this.held = null;
    }
    if (this.bag[type] > 0) {
      this.bag[type] -= 1;
      this.held = type;
      this._attachHandMesh(type);
      this.ui.toast(`${itemLabel(type)} 장착`);
    } else {
      this.ui.toast(`${itemLabel(type)} 없음`);
    }
    this.ui.updateInventory(this.bag, this.held);
  }

  _attachHandMesh(type) {
    this._removeHandMesh();
    const mesh = buildHeldItemMesh(type);
    mesh.rotation.z = Math.PI / 2.4;
    this.player.handAnchor.add(mesh);
    this._handMesh = mesh;
  }

  _removeHandMesh() {
    if (this._handMesh) {
      this.player.handAnchor.remove(this._handMesh);
      this._handMesh = null;
    }
  }

  useHeld() {
    if (!this.held) return;
    if (this.held === 'arrow') {
      this._fireArrow();
      this._removeHandMesh();
      this.held = null;
    } else if (this.held === 'shield') {
      this._activateShield();
      this._removeHandMesh();
      this.held = null;
    } else if (this.held === 'star') {
      this._triggerMeteorShower();
      this._removeHandMesh();
      this.held = null;
    } else if (this.held === 'sword') {
      this._swingSword();
      // sword stays equipped so the player can keep swinging
    }
    this.ui.updateInventory(this.bag, this.held);
  }

  _fireArrow() {
    const p = this.player;
    const dir = new THREE.Vector3(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));
    const start = p.position.clone().add(new THREE.Vector3(0, 1.5, 0)).add(dir.clone().multiplyScalar(0.8));
    const mesh = buildPickupMesh('arrow');
    mesh.position.copy(start);
    mesh.rotation.y = Math.atan2(dir.x, dir.z) - Math.PI / 2;
    this.scene.add(mesh);
    this.projectiles.push({ mesh, dir, life: 2.5, dead: false });
    this.ui.toast('화살 발사!');
  }

  _activateShield() {
    this.player.shieldActive = true;
    this.player.shieldTimer = SHIELD_DURATION;
    if (!this.shieldMesh) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x66c9ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, emissive: 0x2277cc, emissiveIntensity: 0.5 });
      const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.09, 10, 24), mat);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.09, 10, 24), mat.clone());
      ring2.rotation.y = Math.PI / 2;
      const web = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), new THREE.MeshBasicMaterial({ color: 0x99e0ff, transparent: true, opacity: 0.15, side: THREE.DoubleSide }));
      this.shieldMesh = new THREE.Group();
      this.shieldMesh.add(ring1, ring2, web);
      this.shieldMesh.position.y = 1.3;
      this.player.group.add(this.shieldMesh);
    }
    this.shieldMesh.visible = true;
    this.ui.toast('방패 발동!');
  }

  _triggerMeteorShower() {
    this.meteorShowerTimer = METEOR_SHOWER_DURATION;
    for (const b of this.buildings) {
      if (b.kind === 'jangmi' && !b.isCollapsed) b.protect(METEOR_SHOWER_DURATION + 2);
    }
    this.ui.toast('별똥별이 쏟아진다! 소원을 빈다...');

    // The wish: if the player is currently drowning in the Han River, the
    // sky flashes bright and the star saves them, landing inside Lotte Tower.
    if (this.player.fallingInRiver) {
      const saved = this.player.escapeRiverFall(this.interiors.lotteInterior.wishArrivalWorldPos);
      if (saved) {
        this.wishFlashT = WISH_FLASH_DURATION;
        this.ui.toast('소원이 이루어졌다! 롯데타워 안으로 무사히!');
      }
    }
  }

  _spawnMeteor() {
    const x = randRange(CITY_BOUNDS.minX, CITY_BOUNDS.maxX);
    const z = randRange(RIVER_HALF_WIDTH + 5, CITY_BOUNDS.maxZ);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffcf6b, emissive: 0xff8800, emissiveIntensity: 1.2 });
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat);
    mesh.position.set(x, 90, z);
    this.scene.add(mesh);

    const trailMat = new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.5 });
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 8, 6), trailMat);
    trail.position.set(x, 90, z);
    this.scene.add(trail);

    this.meteors.push({ mesh, trail, targetX: x, targetZ: z, exploded: false, life: 0 });
  }

  _swingSword() {
    const p = this.player;
    const forward = new THREE.Vector3(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));
    let bestEnemy = null;
    let bestDist = SWORD_RANGE;
    for (const e of this.getEnemies()) {
      if (!e.alive) continue;
      const ep = e.group.position;
      const d = dist2D(p.position.x, p.position.z, ep.x, ep.z);
      if (d > bestDist) continue;
      const toEnemy = new THREE.Vector3(ep.x - p.position.x, 0, ep.z - p.position.z).normalize();
      if (toEnemy.dot(forward) < 0.35 && d > 1) continue; // must be roughly in front (unless adjacent)
      bestDist = d;
      bestEnemy = e;
    }
    this.swordSwingFlash = 0.15;
    if (bestEnemy) {
      this._applyDamage(bestEnemy, 'sword');
      this.ui.toast(bestEnemy.isBoss ? '괴수를 베었다!' : '처치!');
    }
  }

  _applyDamage(enemy, weapon) {
    if (enemy.isBoss) {
      const killed = enemy.takeHit(ITEM_DAMAGE_TO_BOSS[weapon] ?? 1);
      return killed;
    }
    return enemy.takeHit();
  }

  countMinionsNear(x, z, radius) {
    let n = 0;
    for (const e of this.getEnemies()) {
      if (e.isBoss || !e.alive) continue;
      if (dist2D(x, z, e.group.position.x, e.group.position.z) < radius) n++;
    }
    return n;
  }

  onShieldBreak() {
    if (this.shieldMesh) this.shieldMesh.visible = false;
    this.ui.toast('방패가 부서졌다!');
  }

  update(dt) {
    if (this.wishFlashT > 0) this.wishFlashT = Math.max(0, this.wishFlashT - dt);

    for (const pk of this.pickups) {
      if (pk.collected) continue;
      pk.update(dt);
      if (dist2D(this.player.position.x, this.player.position.z, pk.mesh.position.x, pk.mesh.position.z) < 1.8) {
        pk.collected = true;
        pk.dispose(this.scene);
        this.bag[pk.type] += 1;
        this.ui.toast(`${itemLabel(pk.type)} 획득!`);
        this.ui.updateInventory(this.bag, this.held);
      }
    }

    for (const proj of this.projectiles) {
      if (proj.dead) continue;
      proj.mesh.position.add(proj.dir.clone().multiplyScalar(40 * dt));
      proj.life -= dt;
      for (const e of this.getEnemies()) {
        if (!e.alive || e.isBoss) continue;
        if (proj.mesh.position.distanceTo(e.group.position.clone().add(new THREE.Vector3(0, 0.6, 0))) < 1.1) {
          this._applyDamage(e, 'arrow');
          proj.dead = true;
          break;
        }
      }
      // boss can also be struck by an arrow if it's close enough to the flight path
      for (const e of this.getEnemies()) {
        if (!e.alive || !e.isBoss) continue;
        if (proj.mesh.position.distanceTo(e.eyePosition) < 4) {
          this._applyDamage(e, 'arrow');
          proj.dead = true;
        }
      }
      if (proj.life <= 0) proj.dead = true;
    }
    this.projectiles = this.projectiles.filter((p) => {
      if (p.dead) this.scene.remove(p.mesh);
      return !p.dead;
    });

    if (this.player.shieldActive) {
      this.player.shieldTimer -= dt;
      if (this.shieldMesh) {
        this.shieldMesh.rotation.y += dt * 1.5;
        this.shieldMesh.visible = true;
      }
      if (this.player.shieldTimer <= 0) {
        this.player.shieldActive = false;
        if (this.shieldMesh) this.shieldMesh.visible = false;
      }
    }

    if (this.swordSwingFlash > 0) this.swordSwingFlash -= dt;

    this._updateMeteorShower(dt);
  }

  _updateMeteorShower(dt) {
    if (this.meteorShowerTimer > 0) {
      this.meteorShowerTimer -= dt;
      this.skyDarkT = clamp(this.skyDarkT + dt / 1.5, 0, 1);
      if (Math.random() < dt * 4) this._spawnMeteor();
    } else {
      this.skyDarkT = clamp(this.skyDarkT - dt / 2, 0, 1);
    }

    for (const m of this.meteors) {
      if (m.exploded) { m.life -= dt; continue; }
      m.mesh.position.y -= 60 * dt;
      m.trail.position.y = m.mesh.position.y + 4;
      if (m.mesh.position.y <= 0.5) {
        m.exploded = true;
        m.life = 0.4;
        this.scene.remove(m.trail);
        for (const e of this.getEnemies()) {
          if (!e.alive) continue;
          const d = dist2D(m.targetX, m.targetZ, e.group.position.x, e.group.position.z);
          if (d < 6) this._applyDamage(e, 'meteor');
        }
      }
    }
    this.meteors = this.meteors.filter((m) => {
      if (m.exploded && m.life <= 0) { this.scene.remove(m.mesh); return false; }
      return true;
    });
  }
}

function itemLabel(type) {
  return { arrow: '화살', shield: '방패', star: '별', sword: '칼' }[type] || type;
}
