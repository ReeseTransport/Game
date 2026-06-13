// ============================================================
// AI traffic: lightweight cars that cruise along the circuit.
// ============================================================
import * as THREE from 'three';
import { rand, pick, TAU } from './util.js';

const COLORS = ['#c81f2a', '#d9dde2', '#f2f2f2', '#16181d', '#2f5fb0', '#e8a01f', '#cf3f86'];

function buildTrafficCar(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: '#0c1118', metalness: 0.3, roughness: 0.15 });
  const tail = new THREE.MeshStandardMaterial({ color: '#350207', emissive: '#ff2233', emissiveIntensity: 1.4, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#101216', roughness: 0.8 });

  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true;
    g.add(m); return m;
  };
  add(new THREE.BoxGeometry(1.85, 0.5, 4.2), paint, 0, 0.55, 0);
  add(new THREE.BoxGeometry(1.7, 0.5, 2.3), paint, 0, 0.95, -0.1);
  add(new THREE.BoxGeometry(1.55, 0.5, 2.0), glass, 0, 1.18, -0.1);
  add(new THREE.BoxGeometry(1.45, 0.12, 1.5), paint, 0, 1.42, -0.2);
  add(new THREE.BoxGeometry(1.6, 0.12, 0.05), tail, 0, 0.7, -2.12);
  // wheels
  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 14);
  for (const [x, z] of [[0.95, 1.35], [-0.95, 1.35], [0.95, -1.4], [-0.95, -1.4]]) {
    const t = add(tireGeo, dark, x, 0.38, z);
    t.rotation.z = Math.PI / 2;
  }
  return g;
}

export class Traffic {
  constructor(track, count = 8) {
    this.track = track;
    this.group = new THREE.Group();
    this.cars = [];
    for (let i = 0; i < count; i++) {
      const mesh = buildTrafficCar(pick(COLORS));
      this.group.add(mesh);
      this.cars.push({
        mesh,
        u: i / count + rand(-0.02, 0.02),
        speed: rand(16, 30),           // m/s
        lane: pick([-4.2, 4.2, -1.8]), // lateral offset on the road
        wheel: 0,
      });
    }
    this.update(0);
  }

  update(dt) {
    const L = this.track.length;
    for (const c of this.cars) {
      c.u = (c.u + (c.speed / L) * dt) % 1;
      const p = this.track.getPointAt(c.u);
      const t = this.track.getTangentAt(c.u);
      t.y = 0; t.normalize();
      const nx = -t.z, nz = t.x;
      c.mesh.position.set(p.x + nx * c.lane, 0, p.z + nz * c.lane);
      c.mesh.rotation.y = Math.atan2(t.x, t.z);
    }
  }
}
