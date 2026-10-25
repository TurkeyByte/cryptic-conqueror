// Keyboard + mouse + gamepad input, merged into one snapshot per frame.
// Several layouts work at once: W A S D + J K L, arrows + Z X C, and
// Roblox-style W A S D + Space with mouse clicks to attack.
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  ArrowDown: 'guard', KeyS: 'guard',
  KeyJ: 'light', KeyK: 'heavy', KeyL: 'thrust',
  KeyZ: 'light', KeyX: 'heavy', KeyC: 'thrust',
  KeyE: 'thrust',
  ShiftLeft: 'dash', ShiftRight: 'dash', KeyI: 'dash',
};

const ACTIONS = ['left', 'right', 'jump', 'guard', 'light', 'heavy', 'thrust', 'dash'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.prev = {};
    this.state = {};
    this.pressed = {};
    // Presses are latched until the next update so quick taps between frames aren't lost.
    this.tapped = new Set();
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        if (!e.repeat) this.tapped.add(a);
        this.keys.add(a);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.keys.delete(a);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  // Mouse attacks on the game canvas: left = fast strike, right = heavy, middle = thrust.
  attachMouse(el) {
    const buttons = ['light', 'thrust', 'heavy'];
    el.addEventListener('mousedown', (e) => {
      const a = buttons[e.button];
      if (!a) return;
      e.preventDefault();
      this.tapped.add(a);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(Boolean);
    const s = {};
    if (!pad) return s;
    const b = (i) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] || 0;
    s.left = ax < -0.4 || b(14);
    s.right = ax > 0.4 || b(15);
    s.jump = b(0) || b(12);
    s.guard = b(4) || b(13) || (pad.axes[1] || 0) > 0.6;
    s.light = b(2);
    s.heavy = b(3);
    s.thrust = b(1);
    s.dash = b(5) || b(7);
    return s;
  }

  update() {
    const pad = this.readPad();
    for (const a of ACTIONS) {
      const down = this.keys.has(a) || !!pad[a];
      this.pressed[a] = this.tapped.has(a) || (down && !this.prev[a]);
      this.state[a] = down;
      this.prev[a] = down;
    }
    this.tapped.clear();
  }
}
