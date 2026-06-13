// ============================================================
// Synthesized engine audio: oscillator stack whose pitch tracks RPM.
// Fully optional + guarded — silently no-ops if WebAudio is missing.
// ============================================================
import { clamp, lerp } from './util.js';

export class EngineAudio {
  constructor() {
    this.ok = false;
    this.muted = false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);

      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 700;
      this.filter.Q.value = 6;
      this.filter.connect(this.master);

      this.oscs = [];
      // fundamental + harmonics with slight detune
      const defs = [
        { type: 'sawtooth', mul: 1.0, detune: 0, gain: 0.5 },
        { type: 'sawtooth', mul: 1.0, detune: 12, gain: 0.4 },
        { type: 'square', mul: 0.5, detune: -8, gain: 0.25 },
        { type: 'sine', mul: 2.0, detune: 0, gain: 0.12 },
      ];
      for (const d of defs) {
        const o = this.ctx.createOscillator();
        o.type = d.type;
        o.detune.value = d.detune;
        const g = this.ctx.createGain();
        g.gain.value = d.gain;
        o.connect(g); g.connect(this.filter);
        o.start();
        this.oscs.push({ o, mul: d.mul });
      }
      this.ok = true;
    } catch (e) {
      this.ok = false;
    }
  }

  resume() {
    if (this.ok && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.ok && !this.muted) this.master.gain.setTargetAtTime(0.11, this.ctx.now ?? this.ctx.currentTime, 0.3);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ok) {
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.11, t, 0.05);
    }
    return this.muted;
  }

  update(rpmFrac, load) {
    if (!this.ok) return;
    const base = lerp(38, 165, clamp(rpmFrac, 0, 1));
    const t = this.ctx.currentTime;
    for (const { o, mul } of this.oscs) {
      o.frequency.setTargetAtTime(base * mul, t, 0.04);
    }
    this.filter.frequency.setTargetAtTime(450 + rpmFrac * 2600 + load * 600, t, 0.05);
  }
}
