import { DataTexture, fadeRows } from './roofTextures';

/**
 * How far each piece of a roof shows in one kind of picture (the players', the GM's), as the roof's
 * shader reads it: one byte per piece id. A piece that is to fade (or come back) gets there over
 * `fadeMs`, moved on by `animate`; with 0 it is there at once.
 */
export class RoofFade {
  readonly texture = new DataTexture('r8unorm');
  private shown = new Float32Array(256);
  private target = new Float32Array(256);
  private rows = 1;
  private last = -Infinity;
  /** Some piece is on its way. */
  private moving = false;

  constructor(private readonly fadeMs: number) {
    this.reset(0);
  }

  /** A roof of `count` pieces, every one shown. */
  reset(count: number): void {
    this.rows = fadeRows(count);
    this.shown = new Float32Array(this.rows * 256).fill(1);
    this.target = new Float32Array(this.rows * 256).fill(1);
    this.last = -Infinity;
    this.moving = false;
    this.upload();
  }

  /** The pieces `faded` fade, every other one shows; at once where `instant`. Returns whether the table changed. */
  setFaded(faded: ReadonlySet<number>, instant = false): boolean {
    let changed = false;
    for (let id = 1; id < this.target.length; id++) {
      const target = faded.has(id) ? 0 : 1;
      if (this.target[id] === target) continue;
      this.target[id] = target;
      changed = true;
    }
    if (instant || this.fadeMs <= 0) {
      const moved = this.settle();
      if (moved) this.upload();
      return moved;
    }
    if (changed) {
      // The fade starts at the next frame, however long the roof stood still.
      this.moving = true;
      this.last = -Infinity;
    }
    return changed;
  }

  /** Whether a piece is still on its way. */
  busy(): boolean {
    return this.moving;
  }

  /** Moves every piece on its way towards where it is going, for the time since the last call; true where the table changed. */
  animate(now: number): boolean {
    if (!this.moving) return false;
    const step = Number.isFinite(this.last) ? Math.max(0, now - this.last) / this.fadeMs : 0;
    this.last = now;
    if (step === 0) return false;
    let moving = false;
    for (let id = 0; id < this.shown.length; id++) {
      const from = this.shown[id]!;
      const to = this.target[id]!;
      if (from === to) continue;
      const next = from < to ? Math.min(to, from + step) : Math.max(to, from - step);
      this.shown[id] = next;
      if (next !== to) moving = true;
    }
    this.moving = moving;
    this.upload();
    return true;
  }

  destroy(): void {
    this.texture.destroy();
  }

  private settle(): boolean {
    this.moving = false;
    let moved = false;
    for (let id = 0; id < this.shown.length; id++) {
      if (this.shown[id] === this.target[id]) continue;
      this.shown[id] = this.target[id]!;
      moved = true;
    }
    return moved;
  }

  private upload(): void {
    const bytes = new Uint8Array(this.shown.length);
    for (let id = 0; id < bytes.length; id++) bytes[id] = Math.round(this.shown[id]! * 255);
    this.texture.fill(bytes, 256, this.rows);
  }
}
