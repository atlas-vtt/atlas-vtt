// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Renderer } from 'pixi.js';
import { RemoteLasers, type RemoteLaser } from '../../../../src/app/online/marks/RemoteLasers.ts';
import { LaserBeam, type LaserBeamFrame } from '../../../../src/app/pixi/laser/LaserBeam';
import { MAX_TRAIL_SAMPLES } from '../../../../src/app/pixi/laser/laserBeamGeometry';
import { LASER_FADE_TIME } from '../../../../src/app/tools/laserPointerSettings';

const INTERVAL = 33;
const FRAME = 25 / 3;
const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const renderer = { name: 'webgl' } as unknown as Renderer;
const laser = (changes: Partial<RemoteLaser> = {}): RemoteLaser => ({ who: ANA, color: '#66ffa9', size: 16, at: [0, 0], pts: [], on: false, ...changes });

/** A stroke along x at a pixel a millisecond: the laser's message sent at `now`, with the points drawn since the last one. */
function stroke(now: number): RemoteLaser {
  const pts = [3, 2, 1, 0].flatMap((back) => [now - back * FRAME, 0]);
  return laser({ at: [now, 0], pts, on: true, span: INTERVAL });
}

describe('RemoteLasers', () => {
  let frames: LaserBeamFrame[];
  let lasers: RemoteLasers;

  /** Draws a frame every `FRAME` ms from `from` to `to` and returns what was drawn. */
  const run = (from: number, to: number): LaserBeamFrame[] => {
    const start = frames.length;
    for (let now = from; now <= to; now += FRAME) lasers.tick(now);
    return frames.slice(start);
  };

  beforeEach(() => {
    frames = [];
    // PIXI probes a WebGL context for shader precision; jsdom has none
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(LaserBeam.prototype, 'draw').mockImplementation((frame) => void frames.push({ ...frame, trail: frame.trail.map((point) => ({ ...point })) }));
    lasers = new RemoteLasers(renderer, () => 1, INTERVAL);
  });

  afterEach(() => {
    lasers.destroy();
    vi.restoreAllMocks();
  });

  it('moves a hovering pointer between two messages', () => {
    lasers.update([laser()], 0);
    run(0, 100);
    lasers.update([laser({ at: [100, 0], span: 100 })], 100);
    const drawn = run(100, 260).map((frame) => frame.pointer?.x ?? Number.NaN);
    expect(drawn.every((x, index) => index === 0 || x >= (drawn[index - 1] ?? 0))).toBe(true);
    expect(new Set(drawn.filter((x) => x > 0 && x < 100)).size).toBeGreaterThan(5);
    expect(drawn.at(-1)).toBe(100);
    expect(frames.every((frame) => frame.trail.length === 0 && frame.dot?.x === frame.pointer?.x)).toBe(true);
  });

  it('draws a trail that grows behind the pointer and fades by each point\'s own moment', () => {
    let settled: LaserBeamFrame | undefined;
    const pointers: number[] = [];
    for (let now = 0; now < 1500; now += INTERVAL) {
      lasers.update([stroke(now)], now);
      for (const frame of run(now, now + INTERVAL - 1)) {
        const pointer = frame.pointer;
        if (pointer === null) continue;
        expect(frame.dot).toBeNull();
        expect(frame.trail.at(-1)).toEqual({ ...pointer, life: 1 });
        expect(frame.trail.length).toBeLessThanOrEqual(MAX_TRAIL_SAMPLES + 1);
        for (const point of frame.trail) {
          expect(point.x).toBeLessThanOrEqual(pointer.x + 1e-6);
          expect(point.life).toBeGreaterThan(0);
          expect(point.life).toBeLessThanOrEqual(1);
        }
        if (now > 500) pointers.push(pointer.x);
        settled = frame;
      }
    }
    // The pointer moves on every frame, a frame of the stroke at a time, and not a message at a time.
    const moves = pointers.slice(1).map((x, index) => x - (pointers[index] ?? 0));
    expect(Math.min(...moves)).toBeGreaterThan(0.5 * FRAME);
    expect(Math.max(...moves)).toBeLessThan(1.5 * FRAME);
    // Points drawn a frame apart fade a frame apart, not a message at a time.
    const lives = (settled?.trail ?? []).slice(0, -1).map((point) => point.life);
    expect(lives.length).toBeGreaterThan(60);
    for (let index = 1; index < lives.length; index += 1) expect(((lives[index] ?? 0) - (lives[index - 1] ?? 0)) * LASER_FADE_TIME).toBeCloseTo(FRAME, 0);
  });

  it('keeps drawing a pointer that still has messages to catch up with', () => {
    lasers.update([stroke(0)], 0);
    lasers.update([stroke(33)], 33);
    lasers.update([laser({ at: [33, 0], on: false })], 34);
    const drawn = run(34, 120);
    expect(drawn.some((frame) => frame.dot === null && (frame.pointer?.x ?? 99) < 33)).toBe(true);
    expect(drawn.at(-1)?.dot).toEqual({ x: 33, y: 0, life: 1 });
  });

  it('ends a laser that stops once its trail has faded', () => {
    lasers.update([stroke(0)], 0);
    lasers.update([stroke(33)], 33);
    run(33, 100);
    lasers.update([], 100);
    const fading = run(100, 400);
    expect(fading.at(-1)?.pointer).toBeNull();
    expect(fading.at(-1)?.trail.length).toBeGreaterThan(0);
    expect(fading.at(-1)?.color).toBe('#66ffa9');
    expect(lasers.busy).toBe(true);
    run(400, 100 + 2 * LASER_FADE_TIME);
    expect(lasers.busy).toBe(false);
    expect(lasers.container.children).toHaveLength(0);
  });

  it('hides a pointer that left the map and shows it where it comes back, without a sweep between', () => {
    lasers.update([laser({ at: [10, 0] })], 0);
    run(0, 100);
    lasers.update([laser({ at: null })], 100);
    expect(run(100, 200).at(-1)?.pointer).toBeNull();
    lasers.update([laser({ at: [900, 0] })], 200);
    const back = new Set(run(200, 320).map((frame) => frame.pointer?.x ?? null));
    expect(back).toEqual(new Set([null, 900]));
  });

  it('counts the time a pointer rested in place, so what it does next is not taken for late', () => {
    lasers.update([laser()], 0);
    // The sender's pointer stays where it is, and its messages say that time passes.
    for (let now = INTERVAL; now <= 198; now += INTERVAL) {
      lasers.update([laser({ span: INTERVAL })], now);
      run(now, now + INTERVAL - 1);
    }
    // Then it moves 100 px a message, for longer than lateness is remembered: the drawn pointer stays about a message behind.
    let furthest = 0;
    for (let step = 1; step <= 100; step += 1) {
      const now = 198 + step * INTERVAL;
      lasers.update([laser({ at: [step * 100, 0], span: INTERVAL })], now);
      run(now, now + INTERVAL - 1);
      furthest = Math.max(furthest, step * 100 - (frames.at(-1)?.pointer?.x ?? 0));
    }
    expect(furthest).toBeLessThan(150);
  });

  it('leaves a sender alone whose laser did not change when another one\'s did', () => {
    lasers.update([laser(), laser({ who: BEN, at: [50, 50] })], 0);
    run(0, 100);
    for (let now = 100; now < 400; now += INTERVAL) {
      lasers.update([laser(), laser({ who: BEN, at: [50 + now, 50], span: INTERVAL })], now);
      run(now, now + INTERVAL - 1);
    }
    const still = frames.filter((frame) => frame.pointer?.y === 0).map((frame) => frame.pointer?.x);
    expect(new Set(still)).toEqual(new Set([0]));
    expect(frames.some((frame) => frame.pointer?.y === 50 && frame.pointer.x > 300)).toBe(true);
  });
});
