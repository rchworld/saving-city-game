import * as THREE from 'three';

const CAR_COLORS = [0xffffff, 0xffcc33, 0x33aaff, 0xff5544, 0x66cc66, 0x222222];
const CAR_SPEED = 9;
const CAR_HALF_LEN = 2.2;

// Cars that drive themselves along a closed loop of waypoints. The player
// can step onto one to fight from its roof.
export class Car {
  constructor(scene, loop, startIndex, colorIdx) {
    this.loop = loop;
    this.segIndex = startIndex % loop.length;
    this.segT = Math.random();
    this.roofHeight = 1.5;

    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: CAR_COLORS[colorIdx % CAR_COLORS.length], roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, CAR_HALF_LEN * 2), bodyMat);
    body.position.y = 0.75;
    body.castShadow = true;
    this.group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: 0x9fd6ff, roughness: 0.2, metalness: 0.4, transparent: true, opacity: 0.85 }));
    cabin.position.y = 1.3;
    this.group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const [wx, wz] of [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.35, wz);
      this.group.add(wheel);
    }

    scene.add(this.group);
    this._placeOnLoop();
  }

  _placeOnLoop() {
    const a = this.loop[this.segIndex];
    const b = this.loop[(this.segIndex + 1) % this.loop.length];
    const x = a.x + (b.x - a.x) * this.segT;
    const z = a.z + (b.z - a.z) * this.segT;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  }

  update(dt) {
    const a = this.loop[this.segIndex];
    const b = this.loop[(this.segIndex + 1) % this.loop.length];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    this.segT += (CAR_SPEED * dt) / segLen;
    if (this.segT >= 1) {
      this.segT -= 1;
      this.segIndex = (this.segIndex + 1) % this.loop.length;
    }
    this._placeOnLoop();
  }
}

export function spawnCars(scene, loop, count = 8) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const startIndex = Math.floor((i / count) * loop.length);
    cars.push(new Car(scene, loop, startIndex, i));
  }
  return cars;
}
