import { describe, expect, it } from 'vitest';
import { NO_STRETCH } from '../../src/app/grid/mapStretch';
import { LOCK_MS, ScanChoreography, softnessOf, SWAP_MS } from '../../src/app/pixi/gridAlignment/scanChoreography';
import { IDENTITY } from '../../src/app/pixi/gridAlignment/scanFrame';
import type { ScanFrame, ScanLattice } from '../../src/app/pixi/gridAlignment/scanFrame';
import { affineOf, latticeOnMap, reachOf, worldToImageShare } from '../../src/app/pixi/gridAlignment/scanGeometry';

const REACH = 1000;
const FRAME_MS = 1000 / 60;

function lattice(cellSize: number, gridType: ScanLattice['gridType'] = 'square'): ScanLattice {
  return { gridType, cellSize, offsetX: 3, offsetY: 5, toLattice: IDENTITY };
}

/** Steps `scan` through `milliseconds` at 60 frames a second and returns every frame. */
function run(scan: ScanChoreography, milliseconds: number): ScanFrame[] {
  const frames: ScanFrame[] = [];
  for (let at = 0; at < milliseconds; at += FRAME_MS) frames.push(scan.step(FRAME_MS));
  return frames;
}

describe('softnessOf', () => {
  it('is all haze at the floor of what counts as found, sharp from well-supported on, and never rises with support', () => {
    expect(softnessOf(0.05)).toBe(1);
    expect(softnessOf(0.6)).toBe(0);
    expect(softnessOf(0.9)).toBe(0);
    let last = 1;
    for (let support = 0; support <= 1; support += 0.01) {
      expect(softnessOf(support)).toBeLessThanOrEqual(last);
      last = softnessOf(support);
    }
  });
});

describe('ScanChoreography', () => {
  it('lays its light on the map while it looks, without a swell and without an end of its own', () => {
    const scan = new ScanChoreography(REACH);
    scan.begin();
    const frames = run(scan, 4000);

    // The light comes up once and stays: nothing pulses, nothing travels.
    expect(frames.every((frame, i) => i === 0 || frame.looking >= frames[i - 1]!.looking)).toBe(true);
    expect(frames.at(-1)!.looking).toBe(1);
    expect(frames.at(-1)!.scrim).toBeGreaterThan(0.1);
    expect(frames.every((frame) => !frame.still && !frame.revealed && frame.lock.radius < 0)).toBe(true);
  });

  it('shows the best grid found so far, the softer the less of it lies on the lines', () => {
    const scan = new ScanChoreography(REACH);
    scan.begin();
    scan.fit(lattice(64), 0.2);
    const faint = run(scan, 1800).at(-1)!;
    expect(faint.front.lattice?.cellSize).toBe(64);
    // Etched for the most part at once, and creeping on while the search goes on.
    expect(faint.front.alpha).toBeGreaterThan(0.58);
    expect(faint.front.alpha).toBeLessThan(0.94);
    expect(faint.front.soft).toBeCloseTo(softnessOf(0.2), 2);

    // The same grid found again with more of it on the lines sharpens; nothing takes over.
    scan.fit(lattice(64), 0.7);
    const sure = run(scan, 1200).at(-1)!;
    expect(sure.front.lattice?.cellSize).toBe(64);
    expect(sure.front.soft).toBeCloseTo(0, 2);
    expect(sure.back.lattice).toBeNull();

    // A grid with less on the lines than the one shown is not shown.
    scan.fit(lattice(32), 0.3);
    expect(run(scan, 400).at(-1)!.front.lattice?.cellSize).toBe(64);
  });

  it('lets a better grid take over from the one shown, no more often than fits can be read', () => {
    const scan = new ScanChoreography(REACH);
    scan.begin();
    scan.fit(lattice(64), 0.2);
    scan.step(FRAME_MS);
    scan.fit(lattice(128), 0.4);
    scan.fit(lattice(96, 'hex-vertical'), 0.5);

    // Too soon after the last change: the first grid still stands, alone.
    const early = run(scan, SWAP_MS / 2).at(-1)!;
    expect(early.front.lattice?.cellSize).toBe(64);

    // Then the latest of the better ones takes over, and the one in between was never shown.
    const frames = run(scan, SWAP_MS);
    const taking = frames.at(-1)!;
    expect(taking.front.lattice?.gridType).toBe('hex-vertical');
    expect(taking.back.lattice?.cellSize).toBe(64);
    expect(frames.some((frame) => frame.front.lattice?.cellSize === 128)).toBe(false);
    const settled = run(scan, 1800).at(-1)!;
    expect(settled.front.alpha).toBeGreaterThan(0.58);
    expect(settled.back.alpha).toBe(0);
  });

  it('locks: the swell passes the whole map, the light of the search goes, the grid is revealed once, and the scan lets go', () => {
    const scan = new ScanChoreography(REACH);
    scan.begin();
    scan.fit(lattice(64), 0.3);
    run(scan, 400);
    scan.lock(lattice(64));

    const locking = run(scan, LOCK_MS - 2 * FRAME_MS);
    expect(locking.every((frame) => !frame.revealed)).toBe(true);
    expect(locking.at(-1)!.lock.radius).toBeGreaterThan(REACH * 0.95);
    expect(locking.at(-1)!.front.soft).toBeLessThan(softnessOf(0.3));
    expect(locking.at(-1)!.looking).toBeLessThan(0.1);

    const after = run(scan, 4000);
    expect(after.filter((frame) => frame.revealed)).toHaveLength(1);
    // The glow only ever dies down once the scan lets go.
    expect(after.every((frame, i) => i === 0 || frame.lock.glow <= after[i - 1]!.lock.glow)).toBe(true);
    // From the reveal on the whole map lies behind the swell, so the answer stays sharp while it fades.
    const revealedAt = after.findIndex((frame) => frame.revealed);
    expect(after.slice(revealedAt).every((frame) => frame.still || frame.lock.radius > REACH)).toBe(true);
    expect(after.at(-1)!.still).toBe(true);
    expect(scan.active).toBe(false);

    // Whoever waits for the scan is let go when only the last fifth of the glow is left, well before the very end.
    const quietAt = after.findIndex((frame) => frame.quiet);
    const stillAt = after.findIndex((frame) => frame.still);
    expect(quietAt).toBeGreaterThan(revealedAt);
    expect(after[quietAt - 1]!.lock.glow).toBeGreaterThan(0.2);
    expect(after[quietAt]!).toMatchObject({ scrim: 0, looking: 0 });
    expect(after[quietAt]!.front.alpha).toBe(0);
    expect((stillAt - quietAt) * FRAME_MS).toBeGreaterThan(700);
    expect(after.slice(quietAt).every((frame) => frame.quiet)).toBe(true);
  });

  it('never stands still while it looks: the etching creeps on and the grids being tried follow each other', () => {
    const scan = new ScanChoreography(REACH);
    scan.begin();
    scan.fit(lattice(64), 0.4);
    const etching = run(scan, 5000).map((frame) => frame.front.alpha);
    expect(etching.every((alpha, i) => i === 0 || alpha >= etching[i - 1]!)).toBe(true);
    expect(etching.at(-1)!).toBeGreaterThan(etching[Math.floor(etching.length / 2)]!);

    scan.trial(lattice(32));
    expect(run(scan, 700).at(-1)!.trial.lattice?.cellSize).toBe(32);
    // Trials come faster than they can be shown: the latest one is next, once the one shown has gone.
    scan.trial(lattice(40, 'hex-vertical'));
    scan.trial(lattice(128));
    const frames = run(scan, 1200);
    expect(frames.some((frame) => frame.trial.lattice?.cellSize === 40)).toBe(false);
    expect(frames.at(-1)!.trial.lattice?.cellSize).toBe(128);
    // No trial pops: the one shown is all but gone when the next takes its place.
    const swapAt = frames.findIndex((frame) => frame.trial.lattice?.cellSize === 128);
    expect(frames[swapAt - 1]!.trial.alpha).toBeLessThan(0.15);

    scan.lock(lattice(64));
    expect(run(scan, 900).at(-1)!.trial.alpha).toBeLessThan(0.05);
  });

  it('shows an answer that comes without a search, as on a first load', () => {
    const scan = new ScanChoreography(REACH);
    scan.lock(lattice(70, 'hex-horizontal'));
    const frames = run(scan, LOCK_MS + 3500);
    expect(frames[0]!.front.lattice?.gridType).toBe('hex-horizontal');
    expect(frames.filter((frame) => frame.revealed)).toHaveLength(1);
    expect(frames.at(-1)!.still).toBe(true);
  });

  it('lets go of light and grid where no grid was found, and reveals nothing', () => {
    const scan = new ScanChoreography(REACH);
    scan.begin();
    scan.fit(lattice(64), 0.1);
    run(scan, 800);
    scan.miss();
    const frames = run(scan, 1500);
    expect(frames.every((frame, i) => i === 0 || (frame.looking <= frames[i - 1]!.looking && frame.front.alpha <= frames[i - 1]!.front.alpha))).toBe(true);
    expect(frames.some((frame) => frame.revealed)).toBe(false);
    expect(frames.at(-1)!.still).toBe(true);
  });

  it('goes within half a second when the GM moves on', () => {
    const scan = new ScanChoreography(REACH);
    scan.begin();
    scan.fit(lattice(64), 0.5);
    run(scan, 500);
    scan.cancel();
    expect(run(scan, 500).at(-1)!.still).toBe(true);
  });
});

describe('scan geometry', () => {
  const size = { width: 1000, height: 800 };

  it('reads an affine map off three points', () => {
    const [a, b, c, d, e, f] = affineOf(({ x, y }) => ({ x: 2 * x - y + 7, y: 0.5 * x + 3 * y - 4 }));
    expect([a, b, c, d, e, f]).toEqual([2, -1, 7, 0.5, 3, -4]);
  });

  it('draws a grid found for the map as it is drawn in that world itself', () => {
    const grid = { gridType: 'square' as const, cellSize: 50, offsetX: 4, offsetY: 6 };
    expect(latticeOnMap(grid, size, NO_STRETCH).toLattice).toBe(IDENTITY);
  });

  it('takes a map drawn regular to the world of a grid that wants it stretched', () => {
    const grid = { gridType: 'square' as const, cellSize: 50, offsetX: 4, offsetY: 6, mapStretch: { x: 1, y: 1.1 } };
    const [a, b, c, d, e, f] = latticeOnMap(grid, size, NO_STRETCH).toLattice;
    // A point of the unstretched map lies 1.1 times further down once the map is drawn stretched.
    expect(a * 300 + b * 200 + c).toBeCloseTo(300, 6);
    expect(d * 300 + e * 200 + f).toBeCloseTo(220, 6);
  });

  it('finds a world point on the image, and the reach of a swell from a corner', () => {
    const [a, b, c, d, e, f] = worldToImageShare(size, { x: 1.25, y: 1 });
    expect(a * 625 + b * 400 + c).toBeCloseTo(0.5, 6);
    expect(d * 625 + e * 400 + f).toBeCloseTo(0.5, 6);
    expect(reachOf({ x: 0, y: 0 }, { x: 0, y: 0, width: 300, height: 400 })).toBe(500);
    expect(reachOf({ x: 150, y: 200 }, { x: 0, y: 0, width: 300, height: 400 })).toBe(250);
  });
});
