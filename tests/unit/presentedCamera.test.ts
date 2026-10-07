import { describe, expect, it } from 'vitest';
import { viewCamera, watchViewCamera, type CameraView, type CameraViewport } from '../../src/app/services/presentedCamera';

/** Just enough of pixi-viewport's `Viewport` for the GM camera. */
class FakeViewport implements CameraViewport {
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

const viewWith = (viewport: FakeViewport | null): CameraView => ({ renderer: { getViewportInstance: () => viewport } });

describe('presented camera', () => {
  it("reads the centre and visible world size of the view's viewport", () => {
    expect(viewCamera(viewWith(new FakeViewport()))).toEqual({ centerX: 500, centerY: 400, width: 800, height: 600 });
  });

  it('has no camera without a renderer, a viewport, a live viewport or a size', () => {
    expect(viewCamera(viewWith(null))).toBeNull();
    const destroyed = new FakeViewport();
    destroyed.destroyed = true;
    expect(viewCamera(viewWith(destroyed))).toBeNull();
    const empty = new FakeViewport();
    empty.worldScreenWidth = 0;
    expect(viewCamera(viewWith(empty))).toBeNull();
    expect(viewCamera({ renderer: null })).toBeNull();
  });

  it('calls back after every viewport frame until unwatched', () => {
    const viewport = new FakeViewport();
    const calls: number[] = [];
    const stop = watchViewCamera(viewWith(viewport), () => calls.push(1));
    viewport.frame();
    viewport.frame();
    stop();
    viewport.frame();
    expect(calls).toHaveLength(2);
    expect(viewport.listenerCount).toBe(0);
  });

  it('watching a view without a viewport is a no-op', () => {
    const stop = watchViewCamera(viewWith(null), () => undefined);
    expect(() => stop()).not.toThrow();
  });
});
