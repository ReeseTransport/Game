// Real-browser smoke test: launches headless Chromium (WebGL via SwiftShader),
// loads the game, presses DRIVE, drives, screenshots, and reports any errors.
// Run: node test/browser.mjs   (expects the dev server on :8080)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const SHOTS = new URL('./shots/', import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));

const log = (...a) => console.log(...a);

try {
  await page.goto('http://localhost:8080/', { waitUntil: 'load', timeout: 30000 });

  // WebGL availability
  const gl = await page.evaluate(() => {
    const c = document.getElementById('scene');
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    return ctx ? { ok: true, version: ctx.getParameter(ctx.VERSION) } : { ok: false };
  });
  log('WebGL:', JSON.stringify(gl));

  await page.waitForSelector('#start-btn.ready', { timeout: 30000 });
  await page.screenshot({ path: SHOTS + '01-loader.png' });
  log('✓ loader ready');

  await page.click('#start-btn');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOTS + '02-idle.png' });

  // accelerate while the GLB + HDRI stream in (headless SwiftShader runs in
  // slow-motion, so we gate on state changes rather than wall-clock targets)
  await page.keyboard.down('w');
  const s1 = await page.evaluate(() => window.__fh6());
  let modelLoaded = false;
  try {
    await page.waitForFunction(() => window.__fh6().usingModel === true, { timeout: 25000 });
    modelLoaded = true;
  } catch { /* fall back path still valid */ }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: SHOTS + '03-driving.png' });

  // steer LEFT, then RIGHT, capturing heading so we can confirm direction
  await page.keyboard.down('a');
  await page.waitForTimeout(1600);
  const sL = await page.evaluate(() => window.__fh6());
  await page.screenshot({ path: SHOTS + '05-steer-left.png' });
  await page.keyboard.up('a');
  await page.keyboard.down('d');
  await page.waitForTimeout(1600);
  const sR = await page.evaluate(() => window.__fh6());
  await page.screenshot({ path: SHOTS + '06-steer-right.png' });
  await page.keyboard.up('d');

  // drift: handbrake + steer -> tyre smoke + skid marks
  await page.keyboard.down('Space');
  await page.keyboard.down('d');
  await page.waitForTimeout(1800);
  const sDrift = await page.evaluate(() => window.__fh6());
  await page.screenshot({ path: SHOTS + '07-drift.png' });
  await page.keyboard.up('Space');
  await page.keyboard.up('d');
  const s2 = await page.evaluate(() => window.__fh6());
  await page.keyboard.up('w');

  log('state start  :', JSON.stringify(s1));
  log('steer-left   : heading=' + sL.heading.toFixed(3));
  log('steer-right  : heading=' + sR.heading.toFixed(3));
  log('drift        : particles=' + sDrift.fxParticles + ' skidWrites=' + sDrift.skidWrites);
  log('pipeline     : postfx=' + s2.postfx + ' hdri=' + s2.hdri);
  log('state driving:', JSON.stringify(s2));
  log('GLB model loaded:', modelLoaded);

  // hood cam
  await page.keyboard.press('c');
  await page.keyboard.press('c');
  await page.keyboard.down('w');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOTS + '04-hoodcam.png' });
  await page.keyboard.up('w');

  const moved = Math.abs(s2.x - s1.x) + Math.abs(s2.z - s1.z);
  const fail = [];
  if (!gl.ok) fail.push('WebGL context not created');
  if (!s2.started) fail.push('game did not start');
  if (!modelLoaded) fail.push('GLB car model did not load');
  if (!(s2.mph > 1)) fail.push('car did not accelerate (mph=' + s2.mph + ')');
  if (!(moved > 0.5)) fail.push('car did not move (moved=' + moved.toFixed(2) + ')');
  if (!Number.isFinite(s2.mph)) fail.push('mph not finite');
  if (!s2.postfx) fail.push('post-processing pipeline not active');
  if (!s2.hdri) fail.push('HDRI environment did not load');
  if (!(sDrift.fxParticles > 0)) fail.push('drift produced no smoke/dust particles');
  if (!(sDrift.skidWrites > 0)) fail.push('drift produced no skid marks');

  log('\nSCREENSHOTS:', SHOTS);
  log('CONSOLE/PAGE ERRORS:', errors.length);
  errors.slice(0, 25).forEach((e) => log('  ! ' + e));

  if (fail.length) { log('\nFAILED:'); fail.forEach((f) => log('  ✗ ' + f)); process.exitCode = 1; }
  else log('\n✅ browser smoke test passed');
} catch (e) {
  log('EXCEPTION:', e.message);
  errors.forEach((x) => log('  ! ' + x));
  process.exitCode = 1;
} finally {
  await browser.close();
}
