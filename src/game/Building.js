import * as THREE from 'three';
import { COLORS } from './constants.js';
import { makeTextLabel } from './utils.js';

// A single defensible structure (Lotte Tower, one Jangmi Apartment block,
// Hyanggun Tower or the Samsung CDS Tower). Tracks HP/collapse state and
// exposes a rooftop anchor + ground entrance pad the player can walk onto.
export class Building {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.kind = def.kind;
    this.height = def.height;
    this.radius = def.radius;
    this.pos = new THREE.Vector3(def.pos.x, 0, def.pos.z);

    this.isCollapsed = false;
    this.isCollapsing = false;
    this.collapseProgress = 0;
    this.isProtected = false; // temporary shield from the star meteor shower
    this.protectTimer = 0;

    this.beingLasered = false;
    this.laserTimer = 0; // how long the current beam has been sustained

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.buildMesh();

    this.rooftopWorldPos = new THREE.Vector3(this.pos.x, this.height + 1.4, this.pos.z);
    this.entranceWorldPos = new THREE.Vector3(this.pos.x, 0.9, this.pos.z + this.radius + 8);
  }

  buildMesh() {
    const g = this.group;

    if (this.kind === 'lotte') {
      const bodyH = this.height * 0.78;
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(this.radius * 0.55, this.radius, bodyH, 8),
        new THREE.MeshStandardMaterial({ color: this.def.color, roughness: 0.4, metalness: 0.2 })
      );
      body.position.y = bodyH / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      const spireH = this.height - bodyH;
      const spire = new THREE.Mesh(
        new THREE.ConeGeometry(this.radius * 0.4, spireH, 8),
        new THREE.MeshStandardMaterial({ color: 0xf0f0f5, roughness: 0.3 })
      );
      spire.position.y = bodyH + spireH / 2;
      spire.castShadow = true;
      g.add(spire);
    } else if (this.kind === 'jangmi') {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(this.radius * 1.7, this.height, this.radius * 1.7),
        new THREE.MeshStandardMaterial({ color: this.def.color, roughness: 0.7 })
      );
      body.position.y = this.height / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
      // roof cap for a residential feel
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(this.radius * 1.85, 1.6, this.radius * 1.85),
        new THREE.MeshStandardMaterial({ color: 0x8a4a56, roughness: 0.8 })
      );
      cap.position.y = this.height + 0.8;
      g.add(cap);
    } else if (this.kind === 'hyanggun') {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(this.radius * 1.5, this.height, this.radius * 1.1),
        new THREE.MeshStandardMaterial({ color: this.def.color, roughness: 0.6 })
      );
      body.position.y = this.height / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
    } else {
      // samsungcds — glassy blue tower
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(this.radius * 1.6, this.height, this.radius * 1.6),
        new THREE.MeshStandardMaterial({ color: this.def.color, roughness: 0.2, metalness: 0.5 })
      );
      body.position.y = this.height / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);
    }

    // Rooftop platform (flat, walkable, visually marks the safe combat perch)
    const roofPad = new THREE.Mesh(
      new THREE.CylinderGeometry(this.radius * 0.9, this.radius * 0.9, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 })
    );
    roofPad.position.y = this.height + 0.15;
    g.add(roofPad);
    this.roofPad = roofPad;

    // Ground entrance marker (glowing pad you walk onto to ride up)
    const entrancePad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x554400, emissiveIntensity: 0.6 })
    );
    entrancePad.position.set(0, 0.1, this.radius + 8);
    g.add(entrancePad);
    this.entrancePad = entrancePad;

    const label = makeTextLabel(this.name, { color: '#ffffff' });
    label.position.set(0, this.height + 8, 0);
    g.add(label);
    this.label = label;

    this.bodyMeshes = g.children.filter((c) => c !== this.label);
  }

  // Called by the boss while its eye-laser beam holds on this building.
  applyLaser(dt) {
    if (this.isCollapsed) return;
    this.beingLasered = true;
    if (this.isProtected) return; // meteor-shower shield absorbs the beam
    this.laserTimer += dt;
  }

  clearLaser() {
    this.beingLasered = false;
  }

  resetLaserExposure() {
    this.laserTimer = 0;
  }

  protect(duration) {
    this.isProtected = true;
    this.protectTimer = duration;
  }

  update(dt) {
    if (this.isCollapsing) {
      this.collapseProgress = Math.min(1, this.collapseProgress + dt / 1.6);
      const s = 1 - this.collapseProgress * 0.85;
      this.group.scale.set(s, 1 - this.collapseProgress * 0.7, s);
      this.group.rotation.z = this.collapseProgress * 0.12;
      if (this.collapseProgress >= 1) {
        this.isCollapsing = false;
        this.isCollapsed = true;
      }
      return;
    }
    if (this.isProtected) {
      this.protectTimer -= dt;
      if (this.protectTimer <= 0) this.isProtected = false;
    }
    if (!this.beingLasered) {
      // beam moved on / ended without collapsing -> exposure cools down
      this.laserTimer = Math.max(0, this.laserTimer - dt * 0.5);
    }
    this.beingLasered = false; // boss re-flags this every frame the beam holds
  }

  collapse() {
    if (this.isCollapsed || this.isCollapsing) return;
    this.isCollapsing = true;
    for (const mesh of this.bodyMeshes) {
      mesh.material = mesh.material.clone();
      mesh.material.color.set(COLORS.ash);
      mesh.material.emissive = new THREE.Color(0x110a08);
      mesh.material.roughness = 1;
      mesh.material.metalness = 0;
    }
    this.roofPad.material.color.set(COLORS.ash);
    this.entrancePad.material.emissive.set(0x000000);
  }
}
