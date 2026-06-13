// ============================================================
// HUD: canvas-drawn speedometer + minimap/radar, matching the
// Forza Horizon trailer layout.
// ============================================================
import { clamp, TAU } from './util.js';

const MAGENTA = '#ff2ea0';
const CYAN = '#26e6ff';

export class HUD {
  constructor() {
    this.speedo = document.getElementById('speedo');
    this.sctx = this.speedo.getContext('2d');
    this.minimap = document.getElementById('minimap');
    this.mctx = this.minimap.getContext('2d');
    this.hud = document.getElementById('hud');
    this.speedlines = document.getElementById('speedlines');
    this._sweep = 0;
  }

  show() { this.hud.classList.add('show'); }
  toggle() { this.hud.classList.toggle('hidden'); }

  update(car, track, dt) {
    this._sweep = (this._sweep + dt * 1.4) % TAU;
    this._drawSpeedo(car.rpmFrac, car.gearLabel, Math.round(car.mph));
    this._drawMinimap(track, car);
    // speed-blur overlay intensity
    const f = clamp((car.mph - 40) / 150, 0, 1);
    this.speedlines.style.opacity = (f * 0.9).toFixed(2);
  }

  // -------------------- Speedometer --------------------
  _angle(v) {
    const deg = 210 + (v / 8) * 240;
    return (deg - 90) * Math.PI / 180;
  }

  _drawSpeedo(rpmFrac, gear, mph) {
    const ctx = this.sctx;
    const W = this.speedo.width, H = this.speedo.height;
    ctx.clearRect(0, 0, W, H);
    const cx = 330, cy = 232, R = 150;

    // bezel rings
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R + 16, this._angle(-0.3), this._angle(8.3)); ctx.stroke();

    // background track
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.arc(cx, cy, R, this._angle(0), this._angle(8)); ctx.stroke();

    // filled portion up to current rpm
    const cur = rpmFrac * 8;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.arc(cx, cy, R, this._angle(0), this._angle(Math.min(cur, 7))); ctx.stroke();

    // redline zone 7..8 (and glowing if in it)
    ctx.save();
    ctx.shadowColor = MAGENTA;
    ctx.shadowBlur = cur > 7 ? 22 : 8;
    ctx.strokeStyle = MAGENTA;
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.arc(cx, cy, R, this._angle(7), this._angle(8)); ctx.stroke();
    if (cur > 7) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 11;
      ctx.beginPath(); ctx.arc(cx, cy, R, this._angle(7), this._angle(Math.min(cur, 8))); ctx.stroke();
    }
    ctx.restore();

    // ticks + numbers
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '600 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let v = 0; v <= 8; v++) {
      const a = this._angle(v);
      const x1 = cx + Math.cos(a) * (R - 12), y1 = cy + Math.sin(a) * (R - 12);
      const x2 = cx + Math.cos(a) * (R + 6), y2 = cy + Math.sin(a) * (R + 6);
      ctx.strokeStyle = v >= 7 ? MAGENTA : 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      if (v < 8) {
        const nx = cx + Math.cos(a) * (R - 32), ny = cy + Math.sin(a) * (R - 32);
        ctx.fillStyle = v >= 7 ? MAGENTA : 'rgba(255,255,255,0.92)';
        ctx.fillText(String(v), nx, ny);
      }
      // minor ticks
      if (v < 8) {
        for (let mi = 1; mi < 5; mi++) {
          const a2 = this._angle(v + mi / 5);
          const mx1 = cx + Math.cos(a2) * (R - 4), my1 = cy + Math.sin(a2) * (R - 4);
          const mx2 = cx + Math.cos(a2) * (R + 3), my2 = cy + Math.sin(a2) * (R + 3);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(mx1, my1); ctx.lineTo(mx2, my2); ctx.stroke();
        }
      }
    }

    // driver-aid labels
    ctx.font = '700 12px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const aids = [['LC', 4.3], ['TCR', 5.0], ['ABS', 5.7]];
    for (const [t, v] of aids) {
      const a = this._angle(v);
      ctx.fillText(t, cx + Math.cos(a) * (R + 26), cy + Math.sin(a) * (R + 26));
    }

    // needle
    const na = this._angle(cur);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(na);
    ctx.strokeStyle = cur > 7 ? MAGENTA : '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(R - 14, 0); ctx.stroke();
    ctx.restore();

    // centre gear hub
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    ctx.beginPath(); ctx.arc(cx, cy, 50, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 50, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '700 54px Arial';
    ctx.fillText(gear, cx, cy + 3);

    // speed read-out to the left of the dial
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 22px Arial';
    ctx.fillText('MPH', 196, cy - 36);
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.font = '800 78px Arial';
    ctx.fillText(String(mph), 200, cy + 30);
    ctx.shadowBlur = 0;
  }

  // -------------------- Minimap / radar --------------------
  _drawMinimap(track, car) {
    const ctx = this.mctx;
    const W = this.minimap.width, H = this.minimap.height;
    const cx = W / 2, cy = H / 2, Rm = 150;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, Rm, 0, TAU); ctx.clip();

    // backdrop
    const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Rm);
    bg.addColorStop(0, 'rgba(16,26,38,0.62)');
    bg.addColorStop(1, 'rgba(8,14,22,0.5)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const h = car.heading;
    const fwd = { x: Math.sin(h), z: Math.cos(h) };
    const right = { x: Math.cos(h), z: -Math.sin(h) };
    const range = 320;
    const scale = Rm / range;
    const project = (wx, wz) => {
      const dx = wx - car.pos.x, dz = wz - car.pos.y;
      const sx = dx * right.x + dz * right.z;
      const fy = dx * fwd.x + dz * fwd.z;
      return [cx + sx * scale, cy - fy * scale];
    };

    // road ribbon (draw thick line under thin centre line)
    const s = track.samples;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = track.halfWidth * 2 * scale;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < s.length; i += 2) {
      const [x, y] = project(s[i].p.x, s[i].p.z);
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) { started = false; continue; }
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // radar sweep
    ctx.save();
    ctx.translate(cx, cy);
    const sweepGrad = ctx.createConicGradient ? ctx.createConicGradient(this._sweep, 0, 0) : null;
    if (sweepGrad) {
      sweepGrad.addColorStop(0, 'rgba(38,230,255,0.22)');
      sweepGrad.addColorStop(0.08, 'rgba(38,230,255,0)');
      sweepGrad.addColorStop(1, 'rgba(38,230,255,0)');
      ctx.fillStyle = sweepGrad;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Rm, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.restore(); // un-clip

    // ring
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, Rm, 0, TAU); ctx.stroke();

    // north marker
    const nAng = Math.atan2(right.x * 0 + right.z * -1, fwd.x * 0 + fwd.z * -1);
    const nx = cx + Math.sin(nAng) * (Rm - 20);
    const ny = cy - Math.cos(nAng) * (Rm - 20);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 18px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);

    // player arrow (teal, pointing up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = CYAN; ctx.shadowBlur = 12;
    ctx.fillStyle = CYAN;
    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(12, 12); ctx.lineTo(0, 5); ctx.lineTo(-12, 12);
    ctx.closePath(); ctx.fill();
    // antenna / signal waves beneath
    ctx.shadowBlur = 0;
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 2.5;
    for (let r = 10; r <= 22; r += 6) {
      ctx.globalAlpha = 0.5 - (r - 10) / 40;
      ctx.beginPath(); ctx.arc(0, 26, r, -Math.PI * 0.75, -Math.PI * 0.25); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
