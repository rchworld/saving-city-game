// Centralizes keyboard + pointer-lock mouse state.
// Movement uses the arrow keys; item slots use the top-row digit keys
// (Digit1..Digit4, NOT the numpad); Enter uses the held item.
export class InputManager {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this.onDigit = null; // callback(number)
    this.onEnter = null; // callback()
    this.onCtrl = null; // callback() — pick up / put down a child

    window.addEventListener('keydown', (e) => this._keydown(e));
    window.addEventListener('keyup', (e) => this._keyup(e));
    document.addEventListener('mousemove', (e) => this._mousemove(e));
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
    });
  }

  requestPointerLock() {
    this.domElement.requestPointerLock();
  }

  _keydown(e) {
    if (e.code.startsWith('Arrow')) e.preventDefault();
    const alreadyDown = this.keys.has(e.code);
    this.keys.add(e.code);
    if (e.code === 'Enter' && this.onEnter) this.onEnter();
    const digitMatch = /^Digit([1-4])$/.exec(e.code);
    if (digitMatch && this.onDigit) this.onDigit(Number(digitMatch[1]));
    if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && !alreadyDown && this.onCtrl) this.onCtrl();
  }

  _keyup(e) {
    this.keys.delete(e.code);
  }

  _mousemove(e) {
    if (!this.pointerLocked) return;
    this.mouseDX += e.movementX || 0;
    this.mouseDY += e.movementY || 0;
  }

  // Call once per frame after consuming the accumulated mouse delta.
  consumeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  get forward() {
    return this.isDown('ArrowUp');
  }
  get backward() {
    return this.isDown('ArrowDown');
  }
  get left() {
    return this.isDown('ArrowLeft');
  }
  get right() {
    return this.isDown('ArrowRight');
  }
}
