// ============================================================
// Chase camera: smoothed follow, speed-based FOV, shake, view modes.
// ============================================================
import * as THREE from 'three';
import { damp, clamp, lerp } from './util.js';

const MODES = [
  { name: 'chase', dist: 8.6, height: 3.4, look: 9, lag: 6 },
  { name: 'far',   dist: 13.5, height: 5.2, look: 11, lag: 4.5 },
  { name: 'hood',  dist: -0.2, height: 1.55, look: 16, lag: 30 },
];

export class ChaseCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(62, aspect, 0.4, 5000);
    this.mode = 0;
    this.pos = new THREE.Vector3(0, 5, -10);
    this.target = new THREE.Vector3();
    this.fov = 62;
    this._shake = 0;
    this.cam.position.copy(this.pos);
  }

  cycle() { this.mode = (this.mode + 1) % MODES.length; }

  update(dt, car) {
    const m = MODES[this.mode];
    const h = car.heading;
    const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const carPos = new THREE.Vector3(car.pos.x, 0, car.pos.y);

    const desired = carPos.clone()
      .addScaledVector(fwd, -m.dist)
      .add(new THREE.Vector3(0, m.height, 0));

    const lookAt = carPos.clone()
      .addScaledVector(fwd, m.look)
      .add(new THREE.Vector3(0, 1.1, 0));

    // smooth (hood is near-rigid via high lag)
    this.pos.x = damp(this.pos.x, desired.x, m.lag, dt);
    this.pos.y = damp(this.pos.y, desired.y, m.lag, dt);
    this.pos.z = damp(this.pos.z, desired.z, m.lag, dt);
    this.target.x = damp(this.target.x, lookAt.x, m.lag + 2, dt);
    this.target.y = damp(this.target.y, lookAt.y, m.lag + 2, dt);
    this.target.z = damp(this.target.z, lookAt.z, m.lag + 2, dt);

    // speed FOV
    const speedFrac = clamp(Math.abs(car.speed) / 92, 0, 1);
    const offBoost = car.onRoad ? 0 : 4;
    this.fov = damp(this.fov, 60 + speedFrac * 20 + offBoost, 4, dt);
    this.cam.fov = this.fov;

    // shake: stronger off-road and at very high speed
    const shakeAmt = (car.onRoad ? speedFrac * 0.06 : 0.28) ;
    this._shake = damp(this._shake, shakeAmt, 8, dt);
    const sx = (Math.random() - 0.5) * this._shake;
    const sy = (Math.random() - 0.5) * this._shake;

    this.cam.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    this.cam.lookAt(this.target);
    this.cam.updateProjectionMatrix();
  }

  resize(aspect) {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }
}
