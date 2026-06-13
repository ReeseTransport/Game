// ============================================================
// Forza Horizon 6 — Japan (Fan Recreation)
// Bootstrap + game loop.
// ============================================================
import { World } from './world.js';
import { Track } from './track.js';
import { Car } from './car.js';
import { Traffic } from './traffic.js';
import { Scenery } from './scenery.js';
import { ChaseCamera } from './camera.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { EngineAudio } from './audio.js';
import { clamp } from './util.js';

const canvas = document.getElementById('scene');
const loader = document.getElementById('loader');
const bar = document.getElementById('loader-bar');
const statusEl = document.getElementById('loader-status');
const startBtn = document.getElementById('start-btn');

const aspect = () => window.innerWidth / window.innerHeight;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const setProgress = (p, t) => { bar.style.width = p + '%'; if (t) statusEl.textContent = t; };

let world, track, scenery, traffic, car, chase, hud, input, audio;
let started = false;
let introAngle = 0;

async function init() {
  setProgress(6, 'Starting engine…');
  world = new World(canvas);
  await delay(70);

  setProgress(22, 'Paving the touge…');
  track = new Track();
  world.scene.add(track.group);
  await delay(70);

  setProgress(46, 'Planting cherry blossoms…');
  scenery = new Scenery(track);
  world.scene.add(scenery.group);
  await delay(70);

  setProgress(64, 'Releasing traffic…');
  traffic = new Traffic(track, 8);
  world.scene.add(traffic.group);
  await delay(70);

  setProgress(82, 'Tuning the GT-R…');
  car = new Car(track);
  world.scene.add(car.mesh);
  await delay(70);

  setProgress(94, 'Calibrating HUD…');
  chase = new ChaseCamera(aspect());
  hud = new HUD();
  audio = new EngineAudio();
  input = new Input({
    onCamera: () => started && chase.cycle(),
    onReset: () => started && car.reset(),
    onMute: () => audio.toggleMute(),
    onToggleHud: () => started && hud.toggle(),
  });
  await delay(80);

  setProgress(100, 'Ready to drive');
  startBtn.disabled = false;
  startBtn.classList.add('ready');

  // debug/automation hook: read live state from outside (used by tests)
  window.__fh6 = () => ({
    started, mph: car.mph, speed: car.speed, gear: car.gearLabel,
    rpmFrac: car.rpmFrac, onRoad: car.onRoad, x: car.pos.x, z: car.pos.y,
    heading: car.heading, fov: chase.cam.fov, usingModel: car.usingModel,
  });

  addEventListener('resize', onResize);
  requestAnimationFrame(frame);
}

function start() {
  if (started) return;
  started = true;
  loader.classList.add('gone');
  hud.show();
  audio.resume();
  // seed chase cam from the current intro position to avoid a jump
  chase.pos.copy(chase.cam.position);
  chase.target.copy(car.position3);
}

function onResize() {
  world.resize();
  chase.resize(aspect());
}

function frame() {
  requestAnimationFrame(frame);
  const dt = clamp(world.clock.getDelta(), 0, 0.05);

  if (started) {
    const inp = input.poll();
    car.update(dt, inp);
    audio.update(car.rpmFrac, inp.gas ? 1 : 0);
  }

  traffic.update(dt);
  scenery.update(dt);
  world.update(dt, car.position3);

  if (started) {
    chase.update(dt, car);
    hud.update(car, track, dt);
  } else {
    // slow cinematic orbit while the loader is up
    introAngle += dt * 0.22;
    const cp = car.position3;
    chase.cam.fov = 50;
    chase.cam.position.set(
      cp.x + Math.sin(introAngle) * 12.5,
      4.4,
      cp.z + Math.cos(introAngle) * 12.5,
    );
    chase.cam.lookAt(cp.x, 1.15, cp.z);
    chase.cam.updateProjectionMatrix();
  }

  world.renderer.render(world.scene, chase.cam);
}

startBtn.addEventListener('click', start);

init().catch((err) => {
  console.error(err);
  statusEl.textContent = 'Failed to load: ' + err.message;
});
