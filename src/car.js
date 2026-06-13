// ============================================================
// Player car: GT-R-Nismo-style coupe + arcade driving physics.
// Forward = +Z in local space (nose at +Z, quad tail lights at -Z).
// ============================================================
import * as THREE from 'three';
import { clamp, damp, lerp, toMPH, TAU } from './util.js';

// Gearbox: upper speed (m/s) of each gear.
const GEAR_TOP = [13, 24, 38, 54, 72, 92];
const MAX_SPEED = 92;       // m/s  (~206 mph)
const OFFROAD_MAX = 52;
const IDLE_RPM = 900;
const REDLINE = 7100;
const MAX_RPM = 8000;

const MODEL_URL = './assets/ferrari.glb';
const MODEL_YAW = Math.PI; // rotate the GLB so its nose points to local +Z

export function buildCarMesh() {
  const group = new THREE.Group();

  const body = new THREE.MeshStandardMaterial({ color: '#2b3038', metalness: 0.62, roughness: 0.34 });
  const bodyDark = new THREE.MeshStandardMaterial({ color: '#1c2026', metalness: 0.5, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0b1016', metalness: 0.35, roughness: 0.12 });
  const red = new THREE.MeshStandardMaterial({ color: '#c21024', metalness: 0.3, roughness: 0.4 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#14161a', metalness: 0.4, roughness: 0.55 });
  const tail = new THREE.MeshStandardMaterial({ color: '#3a0306', emissive: '#ff1622', emissiveIntensity: 1.8, roughness: 0.4 });
  const head = new THREE.MeshStandardMaterial({ color: '#222', emissive: '#eaf2ff', emissiveIntensity: 1.1, roughness: 0.3 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = false;
    group.add(m);
    return m;
  };

  // main body masses
  add(new THREE.BoxGeometry(1.92, 0.55, 4.3), body, 0, 0.58, 0);
  add(new THREE.BoxGeometry(1.82, 0.42, 3.5), body, 0, 0.95, -0.1);
  // hood
  add(new THREE.BoxGeometry(1.72, 0.16, 1.5), body, 0, 1.08, 1.35);
  // greenhouse glass
  add(new THREE.BoxGeometry(1.52, 0.56, 2.05), glass, 0, 1.2, -0.18);
  // roof
  add(new THREE.BoxGeometry(1.46, 0.14, 1.5), body, 0, 1.47, -0.34);
  // front nose / bumper
  add(new THREE.BoxGeometry(1.9, 0.5, 0.55), body, 0, 0.62, 2.0);
  add(new THREE.BoxGeometry(1.74, 0.22, 0.3), carbon, 0, 0.4, 2.18);   // front lip
  add(new THREE.BoxGeometry(0.5, 0.06, 0.3), red, 0, 0.4, 2.2);        // red splitter accent
  // rear
  add(new THREE.BoxGeometry(1.9, 0.6, 0.5), body, 0, 0.78, -2.02);
  add(new THREE.BoxGeometry(1.7, 0.34, 0.4), carbon, 0, 0.42, -2.06);  // diffuser
  // side skirts (red Nismo pinstripe)
  add(new THREE.BoxGeometry(0.08, 0.05, 2.7), red, 0.96, 0.42, 0.1);
  add(new THREE.BoxGeometry(0.08, 0.05, 2.7), red, -0.96, 0.42, 0.1);

  // rear wing
  add(new THREE.BoxGeometry(0.1, 0.36, 0.12), carbon, 0.6, 1.18, -1.95);
  add(new THREE.BoxGeometry(0.1, 0.36, 0.12), carbon, -0.6, 1.18, -1.95);
  add(new THREE.BoxGeometry(1.74, 0.07, 0.46), carbon, 0, 1.42, -1.98);
  add(new THREE.BoxGeometry(1.74, 0.03, 0.1), red, 0, 1.42, -2.2);     // wing trailing accent

  // iconic quad round tail lights
  const ring = new THREE.CylinderGeometry(0.17, 0.17, 0.06, 18);
  for (const x of [-0.72, -0.42, 0.42, 0.72]) {
    const m = add(ring, tail, x, 0.92, -2.27);
    m.rotation.x = Math.PI / 2;
  }
  // brake light bar
  add(new THREE.BoxGeometry(1.5, 0.05, 0.04), tail, 0, 1.12, -2.28);

  // headlights
  add(new THREE.BoxGeometry(0.42, 0.12, 0.06), head, 0.62, 0.82, 2.27);
  add(new THREE.BoxGeometry(0.42, 0.12, 0.06), head, -0.62, 0.82, 2.27);

  // wheels
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 22);
  const tireMat = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.85, metalness: 0.05 });
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.32, 10);
  const rimMat = new THREE.MeshStandardMaterial({ color: '#c2c7cd', metalness: 0.85, roughness: 0.28 });
  const wheelPos = [
    [0.98, 0.4, 1.45, true], [-0.98, 0.4, 1.45, true],
    [0.98, 0.4, -1.5, false], [-0.98, 0.4, -1.5, false],
  ];
  for (const [x, y, z, steer] of wheelPos) {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    spin.add(tire, rim);
    wg.add(spin);
    group.add(wg);
    wheels.push({ group: wg, spin, steer });
  }

  return { group, wheels };
}

export class Car {
  constructor(track) {
    this.track = track;
    this.mesh = new THREE.Group();
    const built = buildCarMesh();
    this._procGroup = built.group;     // procedural fallback body (shown until GLB loads)
    this.mesh.add(this._procGroup);
    this.wheels = built.wheels;
    this.usingModel = false;
    this.modelWheels = null;
    this.wheelRadius = 0.4;

    this.pos = new THREE.Vector2();
    this.heading = 0;
    this.speed = 0;
    this.steer = 0;        // smoothed steer input
    this.wheelSpin = 0;
    this.rpm = IDLE_RPM;
    this.gear = 1;
    this.drift = 0;
    this.roll = 0;
    this.pitch = 0;
    this.onRoad = true;
    this.lateral = 0;
    this._prevSpeed = 0;

    this.reset();
    this._loadModel();
  }

  // Load the real 3D car (GLB) asynchronously; fall back to the procedural
  // body on any failure so the game always runs.
  async _loadModel() {
    if (globalThis.__FH6_NO_MODEL) return;
    try {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('../vendor/jsm/loaders/GLTFLoader.js'),
        import('../vendor/jsm/loaders/DRACOLoader.js'),
      ]);
      const draco = new DRACOLoader().setDecoderPath('./vendor/jsm/libs/draco/gltf/');
      const loader = new GLTFLoader().setDRACOLoader(draco);
      const gltf = await loader.loadAsync(MODEL_URL);
      this._applyModel(gltf.scene);
      draco.dispose();
    } catch (e) {
      console.warn('[car] 3D model load failed, using procedural body:', (e && e.message) || e);
    }
  }

  _applyModel(model) {
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: '#39414e', metalness: 0.7, roughness: 0.28,
      clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.4,
    });
    const glassMat = new THREE.MeshStandardMaterial({ color: '#0e141b', metalness: 0.3, roughness: 0.06, envMapIntensity: 1.6, transparent: true, opacity: 0.62 });
    const detailMat = new THREE.MeshStandardMaterial({ color: '#cdd2d8', metalness: 0.95, roughness: 0.35, envMapIntensity: 1.2 });

    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const setMat = (name, mat) => { const n = model.getObjectByName(name); if (n) n.material = mat; };
    setMat('body', bodyMat);
    setMat('glass', glassMat);
    for (const r of ['rim_fl', 'rim_fr', 'rim_rl', 'rim_rr', 'trim']) setMat(r, detailMat);

    // normalize size + sit on the ground inside a container we can orient
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const lengthAlongZ = size.z >= size.x;
    const carLength = Math.max(size.x, size.z);
    const scale = 4.55 / carLength;
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= box.min.y;

    const mg = new THREE.Group();
    mg.add(model);
    mg.scale.setScalar(scale);
    mg.rotation.y = (lengthAlongZ ? 0 : Math.PI / 2) + MODEL_YAW;

    this.modelWheels = [];
    for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
      const node = model.getObjectByName(n);
      if (node) this.modelWheels.push(node);
    }
    this.wheelRadius = 0.34;
    this.mesh.remove(this._procGroup);
    this.mesh.add(mg);
    this._modelGroup = mg;
    this.usingModel = true;
  }

  reset() {
    const p = this.track.startPose();
    this.pos.set(p.x, p.z);
    this.heading = p.heading;
    this.speed = 0;
    this.rpm = IDLE_RPM;
    this._sync();
  }

  get mph() { return Math.abs(toMPH(this.speed)); }
  get rpmFrac() { return clamp(this.rpm / MAX_RPM, 0, 1); }
  get gearLabel() {
    if (this.speed < -0.5) return 'R';
    if (Math.abs(this.speed) < 0.4) return 'N';
    return String(this.gear);
  }
  get position3() { return new THREE.Vector3(this.pos.x, 0, this.pos.y); }
  get forward() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  update(dt, input) {
    const gas = input.gas;
    const brake = input.brake;
    const hand = input.handbrake;
    this.handbrakeOn = hand;

    // ---- longitudinal ----
    const movingFwd = this.speed > 0.2;
    let force = 0;
    const topNow = this.onRoad ? MAX_SPEED : OFFROAD_MAX;
    const powerTaper = clamp(1 - Math.abs(this.speed) / (topNow + 6), 0, 1);
    force += gas * 15 * powerTaper;

    if (brake) {
      if (movingFwd) force -= 28;                 // braking
      else force -= 12 * clamp(1 + this.speed / 10, 0, 1) + 9; // reverse accel
    }
    // resistance (low rolling drag on tarmac -> ~190 mph top end; grass is heavy)
    const rollResist = (this.onRoad ? 0.5 : 3.2) + (hand ? 6 : 0);
    force -= Math.sign(this.speed) * (rollResist + Math.abs(this.speed) * (this.onRoad ? 0.015 : 0.42));

    this.speed += force * dt;
    if (!gas && !brake && Math.abs(this.speed) < 0.25) this.speed = 0;
    this.speed = clamp(this.speed, -11, topNow);

    // ---- steering ----
    const target = input.steer;
    this.steer = damp(this.steer, target, 9, dt);
    const sp = Math.abs(this.speed);
    const lowEnd = clamp(sp / 7, 0, 1);
    const highTame = 1 - 0.5 * clamp((sp - 28) / 64, 0, 1);
    const maxTurn = (hand ? 2.5 : 1.75) * highTame;
    const turnRate = this.steer * maxTurn * lowEnd * Math.sign(this.speed || 1);
    this.heading += turnRate * dt;

    // drift visual yaw under handbrake / hard cornering
    const driftTarget = clamp(turnRate * sp * (hand ? 0.06 : 0.018), -0.5, 0.5);
    this.drift = damp(this.drift, driftTarget, 6, dt);

    // ---- integrate position ----
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.y += fz * this.speed * dt;

    // ---- road / grass ----
    const near = this.track.nearest(this.pos.x, this.pos.y);
    this.onRoad = near.dist < this.track.halfWidth + 1.0;
    this.lateral = turnRate * sp;

    // ---- gearbox + rpm ----
    this._updateGearbox(gas);

    // ---- wheels ----
    const dWheel = (this.speed / this.wheelRadius) * dt;
    this.wheelSpin += dWheel;
    if (this.usingModel && this.modelWheels) {
      for (const node of this.modelWheels) node.rotateX(dWheel);
    } else {
      for (const w of this.wheels) {
        w.spin.rotation.x = this.wheelSpin;
        if (w.steer) w.group.rotation.y = this.steer * 0.5;
      }
    }

    // ---- body roll / pitch for juice ----
    const longAcc = (this.speed - this._prevSpeed) / Math.max(dt, 1e-4);
    this._prevSpeed = this.speed;
    const rollT = clamp(-turnRate * sp * 0.012, -0.16, 0.16);
    const pitchT = clamp(-longAcc * 0.006, -0.07, 0.10);
    this.roll = damp(this.roll, rollT, 7, dt);
    this.pitch = damp(this.pitch, pitchT, 7, dt);

    this._sync();
  }

  _updateGearbox(gas) {
    const sp = Math.abs(this.speed);
    let g = 0;
    while (g < GEAR_TOP.length - 1 && sp > GEAR_TOP[g]) g++;
    this.gear = g + 1;
    const low = g === 0 ? 0 : GEAR_TOP[g - 1];
    const high = GEAR_TOP[g];
    const f = clamp((sp - low) / Math.max(high - low, 1), 0, 1);
    let target = lerp(2500, REDLINE, f);
    if (sp < 2) target = IDLE_RPM + gas * 1700 + sp * 250;
    this.rpm = damp(this.rpm, target, 8, 1 / 60);
  }

  _sync() {
    const yBob = this.onRoad ? 0 : Math.sin(this.wheelSpin * 3) * 0.04;
    this.mesh.position.set(this.pos.x, yBob, this.pos.y);
    this.mesh.rotation.set(this.pitch, this.heading + this.drift, this.roll);
  }
}
