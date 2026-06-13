// Headless logic smoke test. Stubs the DOM/canvas so we can exercise the
// real Three.js geometry + physics code without a WebGL context.
// Run: node test/smoke.mjs
import assert from 'node:assert';

// ---- minimal DOM / canvas stubs ----
const grad = { addColorStop() {} };
const ctxProxy = new Proxy({}, {
  get(_t, p) {
    if (p === 'createRadialGradient' || p === 'createLinearGradient' || p === 'createConicGradient') return () => grad;
    if (p === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set() { return true; },
});
const makeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctxProxy });
globalThis.document = {
  createElement: (t) => (t === 'canvas' ? makeCanvas() : { style: {}, appendChild() {} }),
  getElementById: () => null,
  querySelectorAll: () => [],
  body: { classList: { add() {} } },
  addEventListener() {},
};
globalThis.window = { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, addEventListener() {} };
globalThis.__FH6_NO_MODEL = true; // physics-only test: skip async GLB load

// ---- imports (after stubs) ----
const { Track } = await import('../src/track.js');
const { Car } = await import('../src/car.js');
const { Traffic } = await import('../src/traffic.js');
const { Scenery } = await import('../src/scenery.js');
const { ChaseCamera } = await import('../src/camera.js');

let passed = 0;
const check = (name, cond) => {
  assert.ok(cond, name);
  console.log('  ✓ ' + name);
  passed++;
};

// ---- Track ----
const track = new Track();
check('track length is sane', track.length > 1000 && track.length < 6000);
check('track has samples', track.samples.length > 1000);
const np = track.nearest(track.samples[0].p.x, track.samples[0].p.z);
check('nearest on centre-line ~0', np.dist < 0.5);
const offPt = track.samples[0];
const farX = offPt.p.x + offPt.n.x * 50;
const farZ = offPt.p.z + offPt.n.z * 50;
check('nearest off-road detects distance', track.nearest(farX, farZ).dist > 30);

// ---- Car physics ----
const car = new Car(track);
const start = car.position3.clone();
check('car starts on road', car.onRoad === true);
check('car starts at idle gear', car.gearLabel === 'N' || car.gearLabel === '1');

// drive full throttle while steering to follow the circuit
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
for (let i = 0; i < 1500; i++) {
  const near = track.nearest(car.pos.x, car.pos.y);          // pure-pursuit steering
  const tp = track.samples[(near.idx + 18) % (track.samples.length - 1)].p;
  const desired = Math.atan2(tp.x - car.pos.x, tp.z - car.pos.y);
  const steer = Math.max(-1, Math.min(1, wrap(desired - car.heading) * 2.5));
  car.update(1 / 60, { gas: true, brake: false, handbrake: false, steer });
}
check('speed is finite', Number.isFinite(car.speed) && Number.isFinite(car.pos.x) && Number.isFinite(car.pos.y));
check('reached high speed on tarmac (>55 m/s)', car.speed > 55);
check('mph reads plausibly (120-210)', car.mph > 120 && car.mph < 210);
check('followed the road', track.nearest(car.pos.x, car.pos.y).dist < 40);
check('gear shifted up', Number(car.gearLabel) >= 4);
check('rpmFrac in range', car.rpmFrac >= 0 && car.rpmFrac <= 1);
check('car moved from start', car.position3.distanceTo(start) > 100);

// steering changes heading
const h0 = car.heading;
const left = { gas: true, brake: false, handbrake: false, steer: -1 };
for (let i = 0; i < 60; i++) car.update(1 / 60, left);
check('steering changes heading', Math.abs(car.heading - h0) > 0.05);

// braking / reverse
const brake = { gas: false, brake: true, handbrake: false, steer: 0 };
for (let i = 0; i < 240; i++) car.update(1 / 60, brake);
check('braking reduces/ reverses speed', car.speed <= 0.5);

// reset
car.reset();
check('reset returns to start pose', car.position3.distanceTo(start) < 1 && car.speed === 0);

// ---- Traffic ----
const traffic = new Traffic(track, 8);
check('traffic spawned', traffic.cars.length === 8);
const before = traffic.cars[0].mesh.position.clone();
for (let i = 0; i < 120; i++) traffic.update(1 / 60);
check('traffic moves', traffic.cars[0].mesh.position.distanceTo(before) > 1);
check('traffic positions finite', traffic.cars.every((c) => Number.isFinite(c.mesh.position.x)));

// ---- Scenery ----
const scenery = new Scenery(track);
check('scenery built children', scenery.group.children.length > 0);
check('scenery has a train', scenery.trains.length >= 1);
const tz = scenery.trains[0].mesh.position.z;
for (let i = 0; i < 120; i++) scenery.update(1 / 60);
check('train moves along viaduct', scenery.trains[0].mesh.position.z !== tz);

// ---- Camera ----
const cam = new ChaseCamera(16 / 9);
for (let i = 0; i < 30; i++) cam.update(1 / 60, car);
check('camera position finite', Number.isFinite(cam.cam.position.x) && Number.isFinite(cam.cam.position.y));
check('camera fov sane', cam.cam.fov > 40 && cam.cam.fov < 110);

console.log(`\n  ${passed} checks passed ✅\n`);
