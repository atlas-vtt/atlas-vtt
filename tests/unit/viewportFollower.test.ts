import { describe, expect, it, vi } from 'vitest';
import { FIT_PADDING, GLIDE_MS, MAX_ZOOM, MIN_ZOOM, ViewportFollower, type FollowViewport, type Frames } from '../../src/app/remote-view/ViewportFollower';

class FakeViewport implements FollowViewport {
  screenWidth = 800;
  screenHeight = 600;
  center = { x: 0, y: 0 };
  scale = { x: 1 };
  private readonly listeners = new Set<(event: { type: string }) => void>();
  readonly setZoom = vi.fn((zoom: number): void => { this.scale.x = zoom; });
  readonly moveCenter = vi.fn((x: number, y: number): void => { this.center = { x, y }; });
  on(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.add(listener); }
  off(_event: 'moved', listener: (event: { type: string }) => void): void { this.listeners.delete(listener); }
  /** pixi-viewport's `moved` event after one of its plugins moved it. */
  moved(type: string): void { for (const listener of [...this.listeners]) listener({ type }); }
  get listenerCount(): number { return this.listeners.size; }
}

function manualFrames(): Frames & { run(): void; pending(): number } {
  let queue: Array<() => void> = [];
  return {
    request: (draw) => { queue.push(draw); return queue.length; },
    cancel: () => { queue = []; },
    run: () => { const due = queue; queue = []; due.forEach((draw) => draw()); },
    pending: () => queue.length,
  };
}

function setup(map: { width: number; height: number } | null = { width: 1000, height: 800 }) {
  const viewport = new FakeViewport();
  const frames = manualFrames();
  let now = 0;
  const onMoved = vi.fn();
  const follower = new ViewportFollower({ viewport, mapSize: () => map, onMoved, now: () => now, frames });
  const settle = (): void => {
    now += GLIDE_MS + 1;
    frames.run();
    frames.run();
  };
  return { viewport, frames, follower, onMoved, settle };
}

const CAMERA = { centerX: 200, centerY: 100, width: 400, height: 300 };

describe('ViewportFollower', () => {
  it('shows a camera at once, or glides there with animate, as large as fits the view', () => {
    const { viewport, follower, settle, frames } = setup();
    follower.setCamera(CAMERA, false);
    expect(viewport.center).toEqual({ x: 200, y: 100 });
    expect(viewport.scale.x).toBe(2);
    follower.setCamera({ centerX: 600, centerY: 400, width: 800, height: 600 }, true);
    expect(frames.pending()).toBe(1);
    settle();
    expect(viewport.center).toEqual({ x: 600, y: 400 });
    expect(viewport.scale.x).toBe(1);
  });

  it("stops on the player's own drag, wheel, pinch or glide-out, says so, and stays where they put it", () => {
    const { viewport, follower, onMoved, settle } = setup();
    for (const type of ['drag', 'wheel', 'pinch', 'decelerate']) {
      follower.setCamera(CAMERA, true);
      onMoved.mockClear();
      viewport.center = { x: 321, y: 123 };
      const moves = viewport.moveCenter.mock.calls.length;
      viewport.moved(type);
      expect(onMoved).toHaveBeenLastCalledWith(true);
      settle();
      follower.resize();
      expect(viewport.moveCenter.mock.calls.length).toBe(moves);
      expect(viewport.center).toEqual({ x: 321, y: 123 });
    }
  });

  it("ignores moves that are not the player's", () => {
    const { viewport, follower, onMoved } = setup();
    follower.setCamera(CAMERA, false);
    viewport.moved('animate');
    viewport.moved('follow');
    expect(onMoved).not.toHaveBeenCalled();
  });

  it('fits the whole map with Fit map, and says the camera moved, not by the player', () => {
    const { viewport, follower, onMoved, settle } = setup();
    follower.setCamera(CAMERA, false);
    follower.fitMap();
    expect(onMoved).toHaveBeenLastCalledWith(false);
    settle();
    expect(viewport.center).toEqual({ x: 500, y: 400 });
    expect(viewport.scale.x).toBeCloseTo(Math.min((800 - 32) / 1000, (600 - 32) / 800));
  });

  it("leaves Fit map's margin around a padded camera, also after a resize, so it frames an area as Fit map does", () => {
    expect(FIT_PADDING).toBe(16);
    const { viewport, follower } = setup();
    follower.setCamera(CAMERA, false, true);
    expect(viewport.scale.x).toBeCloseTo(Math.min((800 - 32) / 400, (600 - 32) / 300));
    viewport.screenWidth = 1600;
    viewport.screenHeight = 1200;
    follower.resize();
    expect(viewport.scale.x).toBeCloseTo(Math.min((1600 - 32) / 400, (1200 - 32) / 300));

    const fitted = setup();
    fitted.follower.fitMap();
    fitted.settle();
    const padded = setup();
    padded.follower.setCamera({ centerX: 500, centerY: 400, width: 1000, height: 800 }, false, true);
    expect(padded.viewport.scale.x).toBe(fitted.viewport.scale.x);
    expect(padded.viewport.center).toEqual(fitted.viewport.center);
  });

  it('does nothing for Fit map without a map', () => {
    const { follower, onMoved, viewport } = setup(null);
    follower.fitMap();
    expect(onMoved).not.toHaveBeenCalled();
    expect(viewport.moveCenter).not.toHaveBeenCalled();
  });

  it('puts the camera back after something else moved the viewport, and after a resize', () => {
    const { viewport, follower } = setup();
    follower.setCamera(CAMERA, false);
    viewport.center = { x: 500, y: 400 };
    follower.reapply();
    expect(viewport.center).toEqual({ x: 200, y: 100 });
    viewport.screenWidth = 1600;
    viewport.screenHeight = 1200;
    follower.resize();
    expect(viewport.scale.x).toBe(4);
  });

  it('stops listening and drawing once disposed', () => {
    const { viewport, frames, follower } = setup();
    follower.setCamera(CAMERA, true);
    follower.dispose();
    expect(viewport.listenerCount).toBe(0);
    expect(frames.pending()).toBe(0);
  });

  it('keeps any camera within the zoom limits', () => {
    const { viewport, follower } = setup();
    follower.setCamera({ centerX: 0, centerY: 0, width: 1e-300, height: 1e-300 }, false);
    expect(viewport.scale.x).toBe(MAX_ZOOM);
    follower.setCamera({ centerX: 0, centerY: 0, width: 1e300, height: 1e300 }, false);
    expect(viewport.scale.x).toBe(MIN_ZOOM);
  });
});
