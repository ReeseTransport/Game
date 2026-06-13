// ============================================================
// Scenery: cherry + pine trees (instanced), transmission pylons with
// wires, an elevated shinkansen viaduct + moving bullet train, striped
// tulip fields, and roadside greenhouses. All placed relative to the track.
// ============================================================
import * as THREE from 'three';
import { canvasTexture, rand, pick, randInt, TAU } from './util.js';

export class Scenery {
  constructor(track) {
    this.track = track;
    this.group = new THREE.Group();
    this.trains = [];

    this._trees();
    this._pylons();
    this._viaduct();
    this._fields();
    this._buildings();
  }

  // ---------------- Trees (instanced) ----------------
  _trees() {
    const cherry = [], pine = [];
    const s = this.track.samples;
    const half = this.track.halfWidth;

    for (let i = 0; i < s.length - 1; i += 3) {
      for (const sgn of [1, -1]) {
        if (Math.random() < 0.45) continue;
        const cnt = randInt(1, 2);
        for (let k = 0; k < cnt; k++) {
          const off = (half + rand(5, 58)) * sgn;
          const jx = rand(-3, 3), jz = rand(-3, 3);
          const x = s[i].p.x + s[i].n.x * off + jx;
          const z = s[i].p.z + s[i].n.z * off + jz;
          const scale = rand(0.8, 1.6);
          (Math.random() < 0.34 ? cherry : pine).push({ x, z, scale, rot: rand(0, TAU) });
        }
      }
    }
    // scattered distant forest
    for (let i = 0; i < 600; i++) {
      const a = rand(0, TAU), d = rand(180, 900);
      pine.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, scale: rand(0.9, 1.8), rot: rand(0, TAU) });
    }

    const trunkGeo = new THREE.CylinderGeometry(0.24, 0.34, 3, 6).translate(0, 1.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5b4632', roughness: 1, flatShading: true });
    const cherryGeo = new THREE.IcosahedronGeometry(1.8, 0).translate(0, 3.5, 0);
    const cherryMat = new THREE.MeshStandardMaterial({ color: '#f3b4d0', roughness: 0.95, flatShading: true });
    const pineGeo = new THREE.ConeGeometry(1.9, 5, 7).translate(0, 3.7, 0);
    const pineMat = new THREE.MeshStandardMaterial({ color: '#3d6b30', roughness: 1, flatShading: true });

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, cherry.length + pine.length);
    const cherryI = new THREE.InstancedMesh(cherryGeo, cherryMat, cherry.length);
    const pineI = new THREE.InstancedMesh(pineGeo, pineMat, pine.length);

    const d = new THREE.Object3D();
    let ti = 0;
    const place = (inst, idx, t) => {
      d.position.set(t.x, 0, t.z);
      d.scale.setScalar(t.scale);
      d.rotation.set(0, t.rot, 0);
      d.updateMatrix();
      inst.setMatrixAt(idx, d.matrix);
      d.scale.setScalar(t.scale);
      trunks.setMatrixAt(ti++, d.matrix);
    };
    cherry.forEach((t, i) => place(cherryI, i, t));
    pine.forEach((t, i) => place(pineI, i, t));
    trunks.instanceMatrix.needsUpdate = true;
    cherryI.instanceMatrix.needsUpdate = true;
    pineI.instanceMatrix.needsUpdate = true;
    this.group.add(trunks, cherryI, pineI);
  }

  // ---------------- Transmission pylons + wires ----------------
  _pylonMesh(h = 26) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: '#9aa1aa', roughness: 0.7, metalness: 0.4, flatShading: true });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.2, h, 4), mat);
    mast.position.y = h / 2;
    mast.rotation.y = Math.PI / 4;
    g.add(mast);
    // cross arms
    const armPts = [];
    for (const ay of [h - 3, h - 7]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 0.5), mat);
      arm.position.y = ay;
      g.add(arm);
      armPts.push(new THREE.Vector3(-5.2, ay, 0), new THREE.Vector3(5.2, ay, 0));
    }
    armPts.push(new THREE.Vector3(0, h + 0.5, 0));
    g.userData.attach = armPts;
    return g;
  }

  _pylons() {
    const s = this.track.samples;
    const mat = new THREE.LineBasicMaterial({ color: '#2a2f36', transparent: true, opacity: 0.6 });
    const towers = [];
    // march a line of pylons roughly parallel to a stretch of track
    const startIdx = Math.floor(s.length * 0.30);
    let dist = 0, lastP = null;
    for (let n = 0; n < 11; n++) {
      const idx = (startIdx + n * 70) % (s.length - 1);
      const off = 92;
      const base = s[idx];
      const x = base.p.x + base.n.x * off;
      const z = base.p.z + base.n.z * off;
      const tower = this._pylonMesh(rand(24, 30));
      const yaw = Math.atan2(base.t.x, base.t.z);
      tower.position.set(x, 0, z);
      tower.rotation.y = yaw;
      this.group.add(tower);
      // world-space attachment points
      const worldPts = tower.userData.attach.map((p) => {
        const v = p.clone().applyEuler(new THREE.Euler(0, yaw, 0));
        v.add(new THREE.Vector3(x, 0, z));
        return v;
      });
      towers.push(worldPts);
    }
    // wires (catenary) between consecutive towers
    const positions = [];
    for (let n = 0; n < towers.length - 1; n++) {
      const A = towers[n], B = towers[n + 1];
      const m = Math.min(A.length, B.length);
      for (let w = 0; w < m; w++) {
        const segs = 12;
        for (let sgi = 0; sgi < segs; sgi++) {
          for (const tt of [sgi / segs, (sgi + 1) / segs]) {
            const x = THREE.MathUtils.lerp(A[w].x, B[w].x, tt);
            const z = THREE.MathUtils.lerp(A[w].z, B[w].z, tt);
            const y = THREE.MathUtils.lerp(A[w].y, B[w].y, tt) - Math.sin(tt * Math.PI) * 3.2;
            positions.push(x, y, z);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.group.add(new THREE.LineSegments(geo, mat));
  }

  // ---------------- Shinkansen viaduct + train ----------------
  _viaduct() {
    const s = this.track.samples;
    const idx = Math.floor(s.length * 0.62);
    const base = s[idx];
    const off = 110;
    const cx = base.p.x + base.n.x * off;
    const cz = base.p.z + base.n.z * off;
    const yaw = Math.atan2(base.t.x, base.t.z);

    const via = new THREE.Group();
    via.position.set(cx, 0, cz);
    via.rotation.y = yaw;

    const length = 360, deckY = 11;
    const concrete = new THREE.MeshStandardMaterial({ color: '#b9b4ac', roughness: 0.95 });
    // deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, length), concrete);
    deck.position.y = deckY;
    via.add(deck);
    // side walls
    for (const sx of [-3.2, 3.2]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, length), concrete);
      wall.position.set(sx, deckY + 1.2, 0);
      via.add(wall);
    }
    // pillars
    for (let z = -length / 2 + 14; z < length / 2; z += 30) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(3.4, deckY, 3.4), concrete);
      pil.position.set(0, deckY / 2, z);
      via.add(pil);
    }

    // train
    const train = this._trainMesh();
    train.position.y = deckY + 2.4;
    via.add(train);
    this.trains.push({ mesh: train, length, speed: 70, pos: -length / 2 });

    this.group.add(via);
  }

  _trainMesh() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#eef1f4', roughness: 0.4, metalness: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: '#1f3f8f', roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: '#10151c', roughness: 0.2, metalness: 0.3 });
    const carLen = 22, n = 5;
    for (let i = 0; i < n; i++) {
      const z = i * (carLen + 0.6) - (n * carLen) / 2;
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.1, 3.0, carLen), white);
      body.position.set(0, 0, z);
      g.add(body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.16, 0.5, carLen - 1), blue);
      stripe.position.set(0, -0.5, z);
      g.add(stripe);
      const win = new THREE.Mesh(new THREE.BoxGeometry(3.18, 0.7, carLen - 3), glass);
      win.position.set(0, 0.5, z);
      g.add(win);
    }
    // pointed nose at the front car
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.55, 5, 8), white);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0, (n * carLen) / 2 + 1.6);
    nose.scale.set(1, 0.95, 1);
    g.add(nose);
    return g;
  }

  // ---------------- Striped tulip fields ----------------
  _fieldTexture() {
    return canvasTexture(256, 256, (ctx, w, h) => {
      const cols = ['#e8579a', '#f4d03f', '#9b59b6', '#e74c3c', '#ffffff', '#58d68d'];
      const stripe = 18;
      for (let y = 0; y < h; y += stripe) {
        ctx.fillStyle = pick(cols);
        ctx.fillRect(0, y, w, stripe);
      }
      // subtle row texture
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let x = 0; x < w; x += 6) ctx.fillRect(x, 0, 2, h);
    });
  }

  _fields() {
    const tex = this._fieldTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    const s = this.track.samples;
    for (const frac of [0.18, 0.84]) {
      const base = s[Math.floor(s.length * frac)];
      const sgn = Math.random() < 0.5 ? 1 : -1;
      const off = (this.track.halfWidth + rand(45, 70)) * sgn;
      const x = base.p.x + base.n.x * off;
      const z = base.p.z + base.n.z * off;
      const field = new THREE.Mesh(new THREE.PlaneGeometry(rand(90, 140), rand(70, 100)), mat);
      field.rotation.x = -Math.PI / 2;
      field.rotation.z = Math.atan2(base.t.x, base.t.z) + rand(-0.3, 0.3);
      field.position.set(x, 0.05, z);
      field.receiveShadow = true;
      this.group.add(field);
    }
  }

  // ---------------- Roadside greenhouses / buildings ----------------
  _buildings() {
    const s = this.track.samples;
    const wall = new THREE.MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.85 });
    const roof = new THREE.MeshStandardMaterial({ color: '#8a3b32', roughness: 0.9 });
    const glassRoof = new THREE.MeshStandardMaterial({
      color: '#cfe7ee', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.55,
    });
    for (let n = 0; n < 9; n++) {
      const idx = Math.floor(rand(0, s.length - 1));
      const base = s[idx];
      const sgn = Math.random() < 0.5 ? 1 : -1;
      const off = (this.track.halfWidth + rand(16, 40)) * sgn;
      const x = base.p.x + base.n.x * off;
      const z = base.p.z + base.n.z * off;
      const yaw = Math.atan2(base.t.x, base.t.z) + rand(-0.4, 0.4);

      const b = new THREE.Group();
      b.position.set(x, 0, z);
      b.rotation.y = yaw;
      if (Math.random() < 0.5) {
        // greenhouse: long low translucent structure
        const w = rand(8, 14), len = rand(14, 26);
        const base1 = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, len), wall);
        base1.position.y = 1.1;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, len, 10, 1, false, 0, Math.PI), glassRoof);
        top.rotation.z = Math.PI / 2;
        top.position.y = 2.2;
        b.add(base1, top);
      } else {
        // house: box + peaked roof
        const w = rand(7, 11), len = rand(8, 14), hh = rand(3.5, 5);
        const base1 = new THREE.Mesh(new THREE.BoxGeometry(w, hh, len), wall);
        base1.position.y = hh / 2;
        const rf = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, 3, 4), roof);
        rf.position.y = hh + 1.4;
        rf.rotation.y = Math.PI / 4;
        b.add(base1, rf);
      }
      b.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      this.group.add(b);
    }
  }

  update(dt) {
    for (const t of this.trains) {
      t.pos += t.speed * dt;
      if (t.pos > t.length / 2 + 70) t.pos = -t.length / 2 - 70;
      t.mesh.position.z = t.pos;
    }
  }
}
