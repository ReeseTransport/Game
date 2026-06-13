// ============================================================
// Track: closed spline circuit -> road mesh, lane markings, guardrails.
// Also provides sampling + nearest-point queries used by traffic,
// the camera, off-road physics and the minimap.
// ============================================================
import * as THREE from 'three';
import { canvasTexture, rand, TAU, mulberry32 } from './util.js';

export class Track {
  constructor() {
    this.halfWidth = 9.5;
    this.group = new THREE.Group();

    this._buildCurve();
    this._buildSamples(1100);
    this._buildRoad();
    this._buildMarkings();
    this._buildGuardrails();

    this._lastIdx = 0;
  }

  // Smoothly deformed closed ellipse -> guaranteed non-self-intersecting loop.
  _buildCurve() {
    const rng = mulberry32(20260613);
    const N = 24;
    const rx = 560, rz = 400;
    const pts = [];
    // pre-pick a few harmonic phases for organic curves
    const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const mod = 1
        + 0.16 * Math.sin(2 * a + ph[0])
        + 0.11 * Math.sin(3 * a + ph[1])
        - 0.07 * Math.cos(5 * a + ph[2]);
      pts.push(new THREE.Vector3(Math.cos(a) * rx * mod, 0, Math.sin(a) * rz * mod));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    this.length = this.curve.getLength();
  }

  getPointAt(u) { return this.curve.getPointAt((u % 1 + 1) % 1); }
  getTangentAt(u) { return this.curve.getTangentAt((u % 1 + 1) % 1); }

  _buildSamples(count) {
    this.count = count;
    this.samples = [];
    for (let i = 0; i <= count; i++) {
      const u = i / count;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u);
      t.y = 0; t.normalize();
      const n = new THREE.Vector3(-t.z, 0, t.x); // left normal in XZ
      this.samples.push({ p, t, n, u });
    }
  }

  // Generic ribbon between two lateral offsets (flat, facing up).
  _flatRibbon(offL, offR, y, mat, uvScale) {
    const s = this.samples;
    const pos = [], uv = [], idx = [];
    let dist = 0;
    for (let i = 0; i < s.length; i++) {
      if (i > 0) dist += s[i].p.distanceTo(s[i - 1].p);
      const { p, n } = s[i];
      pos.push(p.x + n.x * offL, y, p.z + n.z * offL);
      pos.push(p.x + n.x * offR, y, p.z + n.z * offR);
      const u = dist / uvScale;
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < s.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const normals = new Float32Array(pos.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return new THREE.Mesh(g, mat);
  }

  // Vertical ribbon (guard rail beam).
  _wallRibbon(off, yBot, yTop, mat) {
    const s = this.samples;
    const pos = [], uv = [], idx = [];
    let dist = 0;
    for (let i = 0; i < s.length; i++) {
      if (i > 0) dist += s[i].p.distanceTo(s[i - 1].p);
      const { p, n } = s[i];
      const x = p.x + n.x * off, z = p.z + n.z * off;
      pos.push(x, yBot, z, x, yTop, z);
      const u = dist / 6;
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < s.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }

  _buildRoad() {
    const tex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#3b3e44';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4200; i++) {
        const v = 40 + Math.floor(rand(-14, 22));
        ctx.fillStyle = `rgba(${v},${v + 2},${v + 6},${rand(0.05, 0.3).toFixed(2)})`;
        ctx.fillRect(rand(0, w), rand(0, h), rand(1, 3), rand(1, 3));
      }
      // faint seam down the middle
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
    }, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 8 });
    tex.repeat.set(1, 1);

    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.0 });
    const road = this._flatRibbon(this.halfWidth, -this.halfWidth, 0.02, mat, 14);
    road.receiveShadow = true;
    this.group.add(road);

    // soft dirt shoulder
    const shoulderMat = new THREE.MeshStandardMaterial({ color: '#7c7257', roughness: 1 });
    this.group.add(this._flatRibbon(this.halfWidth + 2.2, this.halfWidth, 0.01, shoulderMat, 14));
    this.group.add(this._flatRibbon(-this.halfWidth, -this.halfWidth - 2.2, 0.01, shoulderMat, 14));
  }

  _buildMarkings() {
    const white = new THREE.MeshStandardMaterial({
      color: '#eef0ee', roughness: 0.6, emissive: '#3a3a3a', emissiveIntensity: 0.15,
    });
    // solid edge lines
    const edge = this.halfWidth - 0.7;
    this.group.add(this._flatRibbon(edge + 0.16, edge - 0.16, 0.05, white, 14));
    this.group.add(this._flatRibbon(-edge + 0.16, -edge - 0.16, 0.05, white, 14));

    // dashed centre line (separate quads)
    this._buildDashes(0, 0.16, 6, 7, white);
    // dashed lane separators
    this._buildDashes(edge * 0.5, 0.13, 5, 8, white);
    this._buildDashes(-edge * 0.5, 0.13, 5, 8, white);
  }

  _buildDashes(off, halfW, dashLen, gapLen, mat) {
    const s = this.samples;
    const pos = [], idx = [];
    let dist = 0, vi = 0;
    const period = dashLen + gapLen;
    for (let i = 0; i < s.length - 1; i++) {
      const segLen = s[i + 1].p.distanceTo(s[i].p);
      const mid = dist + segLen / 2;
      dist += segLen;
      if ((mid % period) > dashLen) continue;
      const A = s[i], B = s[i + 1];
      const ax = A.p.x + A.n.x * (off + halfW), az = A.p.z + A.n.z * (off + halfW);
      const bx = A.p.x + A.n.x * (off - halfW), bz = A.p.z + A.n.z * (off - halfW);
      const cx = B.p.x + B.n.x * (off + halfW), cz = B.p.z + B.n.z * (off + halfW);
      const dx = B.p.x + B.n.x * (off - halfW), dz = B.p.z + B.n.z * (off - halfW);
      pos.push(ax, 0.05, az, bx, 0.05, bz, cx, 0.05, cz, dx, 0.05, dz);
      idx.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
      vi += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const normals = new Float32Array(pos.length);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    this.group.add(new THREE.Mesh(g, mat));
  }

  _buildGuardrails() {
    const railMat = new THREE.MeshStandardMaterial({
      color: '#c4c9cf', roughness: 0.45, metalness: 0.65, side: THREE.DoubleSide,
    });
    const off = this.halfWidth + 1.4;
    const railL = this._wallRibbon(off, 0.62, 0.98, railMat);
    const railR = this._wallRibbon(-off, 0.62, 0.98, railMat);
    railL.castShadow = railR.castShadow = false;
    this.group.add(railL, railR);

    // posts (instanced) every ~9 m on both sides
    const postGeo = new THREE.BoxGeometry(0.14, 1.0, 0.14);
    const postMat = new THREE.MeshStandardMaterial({ color: '#9aa0a6', roughness: 0.6, metalness: 0.5 });
    const s = this.samples;
    const spacing = 9;
    const placements = [];
    let dist = 0;
    for (let i = 0; i < s.length - 1; i++) {
      dist += s[i + 1].p.distanceTo(s[i].p);
      if (dist >= spacing) {
        dist = 0;
        placements.push(s[i]);
      }
    }
    const inst = new THREE.InstancedMesh(postGeo, postMat, placements.length * 2);
    const m = new THREE.Matrix4();
    let k = 0;
    for (const smp of placements) {
      for (const sgn of [1, -1]) {
        m.makeTranslation(
          smp.p.x + smp.n.x * off * sgn,
          0.5,
          smp.p.z + smp.n.z * off * sgn,
        );
        inst.setMatrixAt(k++, m);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    this.group.add(inst);
  }

  // Nearest centre-line sample to (x,z). Uses a moving search window so it is
  // cheap for an agent that mostly follows the road.
  nearest(x, z) {
    const s = this.samples;
    const n = s.length - 1; // last == first
    const W = 70;
    let best = Infinity, bi = this._lastIdx;
    for (let o = -W; o <= W; o++) {
      const i = ((this._lastIdx + o) % n + n) % n;
      const dx = s[i].p.x - x, dz = s[i].p.z - z;
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    this._lastIdx = bi;
    const smp = s[bi];
    const dx = x - smp.p.x, dz = z - smp.p.z;
    const side = Math.sign(dx * smp.n.x + dz * smp.n.z) || 1;
    return { idx: bi, sample: smp, dist: Math.sqrt(best), side, u: smp.u };
  }

  startPose() {
    const p = this.samples[0].p;
    const t = this.samples[0].t;
    return { x: p.x, z: p.z, heading: Math.atan2(t.x, t.z) };
  }
}
