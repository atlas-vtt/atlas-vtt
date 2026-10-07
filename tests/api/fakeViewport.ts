import type { CameraViewport } from '../../src/app/services/presentedCamera';

/** Just enough of pixi-viewport's `Viewport` for the camera: a centre, a visible size and `frame-end`. */
export class FakeViewport implements CameraViewport {
  center = { x: 500, y: 400 };
  worldScreenWidth = 800;
  worldScreenHeight = 600;
  destroyed = false;
  private readonly listeners = new Set<() => void>();

  on(_event: 'frame-end', listener: () => void): this {
    this.listeners.add(listener);
    return this;
  }

  off(_event: 'frame-end', listener: () => void): this {
    this.listeners.delete(listener);
    return this;
  }

  /** One rendered frame: pixi-viewport emits `frame-end` on every tick. */
  frame(): void {
    for (const listener of [...this.listeners]) listener();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}
