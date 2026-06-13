// ============================================================
// FX: GPU point particles (tyre smoke, off-road dust, speed streaks)
// and a fading rear-tyre skid-mark trail. Driven by car state.
// ============================================================
import * as THREE from 'three';
import { rand, clamp } from './util.js';

const MAX_PARTICLES = 360;
const MAX_SKID = 420;

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.active = 0;
    this.skidWrites = 0;
    this._initParticles();
    this._initSkids();
  }

  // ---------------- particles ----------------
  _initParticles() {
    this.cap = MAX_PARTICLES;
    this.pos = new Float32Array(this.cap * 3);
    this.col = new Float32Array(this.cap * 3);
    this.aSize = new Float32Array(this.cap);
    this.aAlpha = new Float32Array(this.cap);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1).setUsage(THREE.DynamicDrawUsage));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: (typeof window !== 'undefined' ? window.innerHeight : 720) * 0.6 } },
      vertexShader: /* glsl */`
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        varying vec3 vColor; varying float vAlpha;
        uniform float uScale;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (uScale / max(-mv.z, 1.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.04, d) * vAlpha;
          if (a <= 0.002) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.scene.add(this.points);

    this.parts = [];
    for (let i = 0; i < this.cap; i++) {
      this.parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, r: 1, g: 1, b: 1, a: 0, fade: 1, drag: 0.8 });
    }
    this._geo = geo;
    this._cursor = 0;
  }

  _spawn(x, y, z, o) {
    // round-robin so heavy emitters can't starve others
    let idx = -1;
    for (let n = 0; n < this.cap; n++) {
      const i = (this._cursor + n) % this.cap;
      if (this.parts[i].life <= 0) { idx = i; break; }
    }
    if (idx < 0) idx = this._cursor % this.cap;
    this._cursor = (idx + 1) % this.cap;

    const p = this.parts[idx];
    p.life = o.life; p.max = o.life;
    p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
    p.size = o.size; p.grow = o.grow || 0;
    p.r = o.r; p.g = o.g; p.b = o.b; p.a = o.a; p.fade = o.fade || 1; p.drag = o.drag ?? 0.8;
    this.pos[idx * 3] = x; this.pos[idx * 3 + 1] = y; this.pos[idx * 3 + 2] = z;
  }

  emitSmoke(x, y, z, vx, vz) {
    for (let k = 0; k < 2; k++) {
      const g = rand(0.8, 0.96);
      this._spawn(x + rand(-0.35, 0.35), y + rand(0, 0.4), z + rand(-0.35, 0.35), {
        life: rand(0.85, 1.6), vx: vx + rand(-0.7, 0.7), vy: rand(1.0, 2.3), vz: vz + rand(-0.7, 0.7),
        size: rand(1.9, 3.3), grow: rand(2.6, 4.8), r: g, g, b: g, a: rand(0.32, 0.5), fade: 1.1, drag: 1.1,
      });
    }
  }

  emitDust(x, y, z, vx, vz) {
    this._spawn(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), {
      life: rand(0.5, 1.1), vx: vx + rand(-1, 1), vy: rand(0.5, 1.6), vz: vz + rand(-1, 1),
      size: rand(1.0, 2.0), grow: rand(2, 3.6), r: 0.64, g: 0.56, b: 0.41, a: rand(0.25, 0.5), fade: 1, drag: 1.4,
    });
  }

  emitStreak(x, y, z, vx, vz) {
    this._spawn(x, y, z, {
      life: 0.4, vx, vy: rand(-0.2, 0.2), vz, size: rand(0.35, 0.7), grow: -0.6,
      r: 1, g: 1, b: 1, a: 0.3, fade: 1.4, drag: 0.05,
    });
  }

  _updateParticles(dt) {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      const p = this.parts[i];
      if (p.life <= 0) { this.aAlpha[i] = 0; continue; }
      p.life -= dt;
      if (p.life <= 0) { this.aAlpha[i] = 0; continue; }
      n++;
      const lf = clamp(p.life / p.max, 0, 1);
      this.pos[i * 3] += p.vx * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
      const d = 1 - p.drag * dt;
      p.vx *= d; p.vz *= d; p.vy *= (1 - 0.5 * dt);
      p.size += p.grow * dt;
      this.aSize[i] = Math.max(p.size, 0.01);
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.g; this.col[i * 3 + 2] = p.b;
      this.aAlpha[i] = p.a * Math.pow(lf, p.fade);
    }
    this._geo.attributes.position.needsUpdate = true;
    this._geo.attributes.aColor.needsUpdate = true;
    this._geo.attributes.aSize.needsUpdate = true;
    this._geo.attributes.aAlpha.needsUpdate = true;
    this.active = n;
  }

  // ---------------- skid marks ----------------
  _initSkids() {
    this.skidPos = new Float32Array(MAX_SKID * 18);  // 6 verts * 3
    this.skidAlpha = new Float32Array(MAX_SKID * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.skidAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      uniforms: { uColor: { value: new THREE.Color('#0a0a0c') } },
      vertexShader: /* glsl */`
        attribute float aAlpha; varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; varying float vA;
        void main() { if (vA <= 0.003) discard; gl_FragColor = vec4(uColor, vA * 0.55); }`,
    });
    this.skid = new THREE.Mesh(g, m);
    this.skid.frustumCulled = false;
    this.skid.renderOrder = 1;
    this.scene.add(this.skid);
    this._skidGeo = g;
    this._skidHead = 0;
    this._lastL = null;
    this._lastR = null;
  }

  addSkidPoint(cx, cz, dirx, dirz, alpha) {
    const px = -dirz, pz = dirx, hw = 0.85;
    const L = { x: cx + px * hw, z: cz + pz * hw };
    const R = { x: cx - px * hw, z: cz - pz * hw };
    if (this._lastL) {
      const i = this._skidHead * 18;
      const y = 0.04;
      const A = this._lastL, B = this._lastR;
      const set = (o, p) => { this.skidPos[i + o] = p.x; this.skidPos[i + o + 1] = y; this.skidPos[i + o + 2] = p.z; };
      set(0, A); set(3, B); set(6, R);   // tri 1
      set(9, A); set(12, R); set(15, L); // tri 2
      const ai = this._skidHead * 6;
      for (let k = 0; k < 6; k++) this.skidAlpha[ai + k] = alpha;
      this._skidHead = (this._skidHead + 1) % MAX_SKID;
      this._skidGeo.attributes.position.needsUpdate = true;
      this._skidGeo.attributes.aAlpha.needsUpdate = true;
      this.skidWrites++;
    }
    this._lastL = L; this._lastR = R;
  }

  breakSkid() { this._lastL = null; this._lastR = null; }

  _updateSkids(dt) {
    let changed = false;
    const a = this.skidAlpha;
    for (let k = 0; k < a.length; k++) {
      if (a[k] > 0) { a[k] = Math.max(0, a[k] - dt * 0.07); changed = true; }
    }
    if (changed) this._skidGeo.attributes.aAlpha.needsUpdate = true;
  }

  // ---------------- driver ----------------
  update(dt, car) {
    const sp = Math.abs(car.speed);
    const f = car.forward;          // Vector3 (x,_,z)
    const px = -f.z, pz = f.x;      // right vector
    const rx = car.pos.x - f.x * 1.6;
    const rz = car.pos.y - f.z * 1.6;
    const sliding = car.handbrakeOn || Math.abs(car.drift) > 0.12;

    if (car.onRoad && sp > 6 && sliding) {
      const mag = clamp(Math.abs(car.drift) * 2 + (car.handbrakeOn ? 0.4 : 0), 0, 1);
      for (const off of [0.9, -0.9]) {
        this.emitSmoke(rx + px * off, 0.25, rz + pz * off, -f.x * sp * 0.08, -f.z * sp * 0.08);
      }
      this.addSkidPoint(rx, rz, f.x, f.z, clamp(0.45 + mag, 0, 1));
    } else {
      this.breakSkid();
    }

    if (!car.onRoad && sp > 4) {
      for (const off of [1, -1]) {
        this.emitDust(rx + px * off, 0.12, rz + pz * off, -f.x * sp * 0.08, -f.z * sp * 0.08);
      }
    }

    if (sp > 55) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const sx = car.pos.x + px * rand(6, 14) * side + f.x * rand(6, 22);
      const sz = car.pos.y + pz * rand(6, 14) * side + f.z * rand(6, 22);
      this.emitStreak(sx, rand(0.6, 4.2), sz, -f.x * sp * 1.2, -f.z * sp * 1.2);
    }

    this._updateParticles(dt);
    this._updateSkids(dt);
  }
}
