import * as THREE from 'three';
import { randRange, randChoice, dist2D } from './utils.js';

const CAR_COLORS = [0xffffff, 0xffcc33, 0x33aaff, 0xff5544, 0x66cc66, 0x222222];
const CAR_SPEED = 9;
const CAR_HALF_LEN = 2.2;
const BOOST_SPEED_MULT = 2.2;
const BOOST_DURATION = 3;

// Cars that drive themselves along a closed loop of waypoints. The player
// can step onto one to fight from its roof.
export class Car {
  constructor(scene, loop, startIndex, colorIdx) {
    this.loop = loop;
    this.segIndex = startIndex % loop.length;
    this.segT = Math.random();
    this.roofHeight = 1.5;
    this.boostTimer = 0;
    this.stoppedByLight = false;

    // River-plunge flourish state: 'none' | 'diving' | 'submerged'
    this.riverState = 'none';
    this.riverTimer = 0;

    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: CAR_COLORS[colorIdx % CAR_COLORS.length], roughness: 0.5, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, CAR_HALF_LEN * 2), bodyMat);
    body.position.y = 0.75;
    body.castShadow = true;
    this.group.add(body);
    this.bodyMat = bodyMat;

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

  // A brief speed boost, e.g. when a rescued child drives off to safety.
  boostAway() {
    this.boostTimer = BOOST_DURATION;
  }

  // Sends this car onto Jamsil Bridge and off the edge into the Han River —
  // pure spectacle, doesn't affect the player or their own river-fall rule.
  startRiverPlunge() {
    if (this.riverState !== 'none') return;
    this.riverState = 'diving';
    this.riverTimer = 1.6;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.group.position.set(side * randRange(3, 5.5), 3.2, randRange(-20, 20));
    this._diveStart = this.group.position.clone();
  }

  update(dt, ctx = {}) {
    if (this.riverState === 'diving') {
      this.riverTimer -= dt;
      const t = 1 - Math.max(0, this.riverTimer / 1.6);
      this.group.position.y = this._diveStart.y - t * t * 6;
      this.group.rotation.z = t * 0.9;
      this.group.rotation.x = t * 0.4;
      if (this.riverTimer <= 0) {
        this.riverState = 'submerged';
        this.riverTimer = randRange(6, 12);
        this.group.visible = false;
      }
      return;
    }
    if (this.riverState === 'submerged') {
      this.riverTimer -= dt;
      if (this.riverTimer <= 0) {
        this.riverState = 'none';
        this.group.visible = true;
        this.group.rotation.set(0, this.group.rotation.y, 0);
        this.segIndex = Math.floor(Math.random() * this.loop.length);
        this.segT = Math.random();
        this._placeOnLoop();
      }
      return;
    }

    if (this.boostTimer > 0) this.boostTimer -= dt;

    let speed = CAR_SPEED * (this.boostTimer > 0 ? BOOST_SPEED_MULT : 1);

    // Traffic lights: slow to a stop for a red light near the end of this segment.
    this.stoppedByLight = false;
    if (ctx.trafficLights) {
      for (const light of ctx.trafficLights) {
        if (light.segIndex !== this.segIndex || light.state !== 'red') continue;
        if (this.segT > 0.72 && this.segT < 0.97) {
          this.stoppedByLight = true;
          break;
        }
      }
    }

    // Avoid rear-ending the car ahead on the same segment.
    if (!this.stoppedByLight && ctx.cars) {
      for (const other of ctx.cars) {
        if (other === this || other.segIndex !== this.segIndex || other.riverState !== 'none') continue;
        const gap = other.segT - this.segT;
        if (gap > 0 && gap < 0.045) {
          speed *= 0.15;
          break;
        }
      }
    }

    if (this.stoppedByLight) speed = 0;

    const a = this.loop[this.segIndex];
    const b = this.loop[(this.segIndex + 1) % this.loop.length];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    this.segT += (speed * dt) / segLen;
    if (this.segT >= 1) {
      this.segT -= 1;
      this.segIndex = (this.segIndex + 1) % this.loop.length;
    }
    this._placeOnLoop();
  }
}

// A couple of intersections along the loop where cars stop for a red light.
export function createTrafficLights(loop) {
  const indices = loop.length >= 6 ? [1, 4] : [0];
  return indices.map((segIndex, i) => ({
    segIndex,
    state: i % 2 === 0 ? 'green' : 'red',
    timer: randRange(4, 8),
    pos: loop[segIndex],
  }));
}

export function updateTrafficLights(lights, dt) {
  for (const light of lights) {
    light.timer -= dt;
    if (light.timer <= 0) {
      light.state = light.state === 'green' ? 'red' : 'green';
      light.timer = light.state === 'green' ? randRange(6, 9) : randRange(4, 6);
    }
  }
}

export function updateCars(cars, dt, trafficLights, excludeCar) {
  updateTrafficLights(trafficLights, dt);
  for (const car of cars) car.update(dt, { trafficLights, cars });

  // Rarely send a random car (never the one the player is riding) across
  // the bridge and into the river, purely as background spectacle.
  if (Math.random() < dt * 0.01) {
    const candidates = cars.filter((c) => c !== excludeCar && c.riverState === 'none');
    if (candidates.length) randChoice(candidates).startRiverPlunge();
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
