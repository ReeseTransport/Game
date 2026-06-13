// ============================================================
// Input: keyboard + on-screen touch controls.
// Produces gas / brake / handbrake / steer, plus one-shot actions.
// ============================================================
export class Input {
  constructor(handlers = {}) {
    this.gas = false;
    this.brake = false;
    this.handbrake = false;
    this._left = false;
    this._right = false;
    this._tLeft = false;
    this._tRight = false;
    this._tGas = false;
    this._tBrake = false;
    this.handlers = handlers;

    addEventListener('keydown', (e) => this._key(e, true), { passive: false });
    addEventListener('keyup', (e) => this._key(e, false));
    this._setupTouch();
  }

  get steer() {
    const l = this._left || this._tLeft;
    const r = this._right || this._tRight;
    // left key steers left (negative heading change handled in car.js)
    return (l ? 1 : 0) - (r ? 1 : 0);
  }

  _key(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.gas = down; break;
      case 'KeyS': case 'ArrowDown': this.brake = down; break;
      case 'KeyA': case 'ArrowLeft': this._left = down; break;
      case 'KeyD': case 'ArrowRight': this._right = down; break;
      case 'Space': this.handbrake = down; e.preventDefault(); break;
      case 'KeyC': if (down) this.handlers.onCamera?.(); break;
      case 'KeyR': if (down) this.handlers.onReset?.(); break;
      case 'KeyM': if (down) this.handlers.onMute?.(); break;
      case 'KeyH': if (down) this.handlers.onToggleHud?.(); break;
      default: return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }

  _setupTouch() {
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('touch');

    document.querySelectorAll('.tbtn').forEach((btn) => {
      const key = btn.dataset.key;
      const on = (e) => { e.preventDefault(); this._touch(key, true); };
      const off = (e) => { e.preventDefault(); this._touch(key, false); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('pointerleave', off);
    });
  }

  _touch(key, v) {
    if (key === 'left') this._tLeft = v;
    else if (key === 'right') this._tRight = v;
    else if (key === 'gas') this._tGas = v;
    else if (key === 'brake') this._tBrake = v;
  }

  // Combine keyboard + touch for pedals (steer handled in getter).
  poll() {
    return {
      gas: this.gas || this._tGas,
      brake: this.brake || this._tBrake,
      handbrake: this.handbrake,
      steer: this.steer,
    };
  }
}
