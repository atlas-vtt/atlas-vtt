import { Application, Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GridType } from '../../src/app/grid/GridSystem';
import { NO_STRETCH } from '../../src/app/grid/mapStretch';
import { GridScanLayer } from '../../src/app/pixi/gridAlignment/GridScanLayer';
import { LOCK_FADE_MS, LOCK_MS } from '../../src/app/pixi/gridAlignment/scanChoreography';
import { ScanPace } from '../../src/app/pixi/gridAlignment/scanPace';
import type { AlignmentResult } from '../../src/app/pixi/gridAlignmentMath';
import { gridLineSamples } from '../../src/app/pixi/spectralEngine/gridTemplate';

/**
 * The grid scan draws its grids in a shader, from the distance to the nearest line, while the
 * scene's grid is drawn by the grid drawers. The scan hands over to the scene's grid at the end of
 * a detection, so the two must lie on the same lines; and a grid waiting behind the scan must
 * always be let out.
 */

const SIZE = 600;
/** How bright a pixel of a line is at the least, while the answer's glow is going. */
const LIT = 0.3;
const MAP = { x: 0, y: 0, width: 900, height: 900 };

interface Stage {
  app: Application;
  world: Container;
  scan: GridScanLayer;
  overlays: Container[];
}

/** A pace that never steps down: a browser that ticks at 30 frames a second under load would get the scan at half its pixels. */
class SteadyPace extends ScanPace {
  override frame(): boolean {
    return false;
  }
}

let open: Stage | null = null;

async function stage(scale = 1, x = 0, y = 0, pace = new ScanPace()): Promise<Stage> {
  document.body.style.setProperty('--interactive-accent', '#ffffff');
  const app = new Application();
  await app.init({ width: SIZE, height: SIZE, resolution: 1, preference: 'webgl', antialias: false, backgroundColor: 0x000000 });
  const world = new Container();
  world.scale.set(scale);
  world.position.set(x, y);
  app.stage.addChild(world);
  const overlays: Container[] = [];
  const scan = GridScanLayer.create({
    app,
    viewport: world as unknown as Viewport,
    map: { worldRect: MAP, imageSize: { width: MAP.width, height: MAP.height }, mapStretch: NO_STRETCH },
    addOverlay: (overlay) => {
      overlays.push(overlay);
      app.stage.addChild(overlay);
      return () => overlay.removeFromParent();
    },
  }, pace);
  if (!scan) throw new Error('no WebGL in this browser');
  open = { app, world, scan, overlays };
  return open;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

/** How bright the canvas is at a point of the screen, 0–1. */
function brightness({ app }: Stage): (x: number, y: number) => number {
  // The drawing buffer is read in the task it was drawn in.
  app.render();
  const copy = new OffscreenCanvas(SIZE, SIZE).getContext('2d')!;
  copy.drawImage(app.canvas, 0, 0, SIZE, SIZE);
  const { data } = copy.getImageData(0, 0, SIZE, SIZE);
  return (x, y) => (data[(y * SIZE + x) * 4] ?? 0) / 255;
}

describe('grid scan', () => {
  afterEach(() => {
    open?.scan.destroy();
    open?.app.destroy(true, { children: true });
    open = null;
  });

  const grids: Array<{ gridType: GridType; cellSize: number; offsetX: number; offsetY: number }> = [
    { gridType: 'square', cellSize: 70, offsetX: 12, offsetY: 31 },
    { gridType: 'hex-vertical', cellSize: 84, offsetX: 17.5, offsetY: 9 },
    { gridType: 'hex-horizontal', cellSize: 76, offsetX: -20, offsetY: 44.25 },
  ];

  for (const [scale, x, y] of [[1, 0, 0], [0.6, 40, -25]] as const) {
    for (const grid of grids) {
      it(`draws ${grid.gridType} on the lines the grid drawers draw, with the map at ${scale}`, async () => {
        // Where the lines lie is asked of the scan at its full pixels, whatever pace this machine keeps today.
        const view = await stage(scale, x, y, new SteadyPace());
        const revealed = new Promise<void>((resolve) => view.scan.lock(grid as AlignmentResult, null, resolve));
        await revealed;
        // The answer stands sharp over the whole map after the swell, which bends the grid with the map
        // while it passes: once it has died away the grid lies where it belongs, its glow already going.
        await wait(900);
        const at = brightness(view);

        const bounds = { minX: MAP.x, minY: MAP.y, maxX: MAP.x + MAP.width, maxY: MAP.y + MAP.height };
        // The drawers draw a cell past the bounds, the scan the map alone.
        const samples = gridLineSamples(grid.gridType, grid.cellSize, grid.offsetX, grid.offsetY, bounds, 7)
          .filter((sample) => sample.x > 2 && sample.y > 2 && sample.x < MAP.width - 2 && sample.y < MAP.height - 2)
          .map((sample) => ({ x: sample.x * scale + x, y: sample.y * scale + y }))
          .filter((point) => point.x > 2 && point.y > 2 && point.x < SIZE - 2 && point.y < SIZE - 2);
        expect(samples.length).toBeGreaterThan(300);
        // A line is under two pixels wide and a sample falls anywhere in its pixel: the line passes through it or a pixel next to it.
        const onLine = ({ x: px, y: py }: { x: number; y: number }): boolean => {
          const cx = Math.floor(px);
          const cy = Math.floor(py);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(cx + dx, cy + dy) > LIT) return true;
          return false;
        };
        expect(samples.filter((point) => !onLine(point))).toEqual([]);

        // And nowhere else: lines of about two pixels take a small share of cells this size.
        let lit = 0;
        for (let py = 0; py < SIZE; py += 3) for (let px = 0; px < SIZE; px += 3) if (at(px, py) > LIT) lit++;
        expect(lit / (SIZE / 3) ** 2).toBeLessThan((6 * 1.4) / (grid.cellSize * scale));
      });
    }
  }

  it('shows nothing before a scan and nothing once it has let go', async () => {
    const view = await stage();
    const overlay = view.overlays[0]!;
    expect(overlay.visible).toBe(false);

    view.scan.start();
    await wait(100);
    expect(overlay.visible).toBe(true);
    expect(view.scan.active).toBe(true);

    view.scan.cancel();
    await wait(500);
    expect(overlay.visible).toBe(false);
    expect(view.scan.active).toBe(false);
    const at = brightness(view);
    expect(at(SIZE / 2, SIZE / 2)).toBe(0);
  });

  it('reveals the grid once the locking wave has passed, and once only', async () => {
    const view = await stage();
    let reveals = 0;
    const started = performance.now();
    let revealedAfter = 0;
    view.scan.start();
    view.scan.lock(grids[0] as AlignmentResult, new Float32Array([100, 100, 170, 100]), () => {
      reveals++;
      revealedAfter = performance.now() - started;
    });
    await wait(LOCK_MS + LOCK_FADE_MS + 1000);
    expect(reveals).toBe(1);
    expect(revealedAfter).toBeGreaterThan(LOCK_MS - 60);
    expect(revealedAfter).toBeLessThan(LOCK_MS + 250);
    expect(view.scan.active).toBe(false);
  });

  it('never keeps a grid waiting: a scan that is cancelled or destroyed reveals at once', async () => {
    const view = await stage();
    let reveals = 0;
    view.scan.lock(grids[0] as AlignmentResult, null, () => reveals++);
    view.scan.cancel();
    expect(reveals).toBe(1);

    view.scan.lock(grids[1] as AlignmentResult, null, () => reveals++);
    view.scan.destroy();
    expect(reveals).toBe(2);

    // A scan that ended by itself is destroyed again by the scene that is left: that must be nothing.
    expect(() => view.scan.destroy()).not.toThrow();
    view.scan.start();
    expect(view.scan.active).toBe(false);
    view.scan.lock(grids[0] as AlignmentResult, null, () => reveals++);
    expect(reveals).toBe(3);
    open?.app.destroy(true, { children: true });
    open = null;
  });

  /** A device that drew `frames` frames of `milliseconds` each. */
  function paceAfter(milliseconds: number, frames: number): ScanPace {
    const pace = new ScanPace();
    pace.begin();
    for (let i = 0; i < frames; i++) pace.frame(milliseconds);
    return pace;
  }

  it('draws the scan at half its pixels on a device that is slow, with the grid still on its lines', async () => {
    const pace = paceAfter(40, 40);
    expect(pace.quality).toBe('half');
    const view = await stage(1, 0, 0, pace);
    const grid = grids[0]!;
    await new Promise<void>((resolve) => view.scan.lock(grid as AlignmentResult, null, resolve));
    await wait(900);
    const at = brightness(view);

    // Lines are twice as wide and softer at half the pixels: each of the drawers' lines still has light on it.
    const bounds = { minX: MAP.x, minY: MAP.y, maxX: MAP.x + MAP.width, maxY: MAP.y + MAP.height };
    const samples = gridLineSamples(grid.gridType, grid.cellSize, grid.offsetX, grid.offsetY, bounds, 7)
      .filter((sample) => sample.x > 4 && sample.y > 4 && sample.x < SIZE - 4 && sample.y < SIZE - 4);
    const dark = samples.filter(({ x, y }) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (at(Math.floor(x) + dx, Math.floor(y) + dy) > 0.2) return false;
      return true;
    });
    expect(dark).toEqual([]);
    // And the middle of a cell has none.
    expect(at(Math.round(grid.offsetX + grid.cellSize * 2.5), Math.round(grid.offsetY + grid.cellSize * 2.5))).toBeLessThan(0.1);
  });

  it('makes no scan at all for a device that was too slow even at half the pixels', async () => {
    const pace = paceAfter(60, 80);
    expect(pace.quality).toBe('none');
    const app = new Application();
    await app.init({ width: 64, height: 64, preference: 'webgl' });
    const scan = GridScanLayer.create({
      app,
      viewport: new Container() as unknown as Viewport,
      map: { worldRect: MAP, imageSize: { width: MAP.width, height: MAP.height }, mapStretch: NO_STRETCH },
      addOverlay: () => () => undefined,
    }, pace);
    expect(scan).toBeNull();
    app.destroy(true, { children: true });
  });

  it('may be destroyed by whoever hears that it is still, as a new scene\'s detection does', async () => {
    const view = await stage();
    const thrown: unknown[] = [];
    const heard = (event: ErrorEvent): void => {
      event.preventDefault();
      thrown.push(event.error);
    };
    window.addEventListener('error', heard);
    let stills = 0;
    view.scan.whenStill(() => {
      stills++;
      view.scan.destroy();
    });
    view.scan.start();
    await wait(100);
    view.scan.cancel();
    await wait(600);
    window.removeEventListener('error', heard);

    expect(thrown).toEqual([]);
    expect(stills).toBe(1);
    // The app's ticker goes on: a throw inside it would have ended every later frame of the map.
    let ticks = 0;
    const count = (): void => { ticks++; };
    view.app.ticker.add(count);
    await wait(100);
    view.app.ticker.remove(count);
    expect(ticks).toBeGreaterThan(0);
  });

  it('lets go of its textures before destroying them, through a scan begun again and to its end', async () => {
    const view = await stage(1, 0, 0, new SteadyPace());
    const warned = vi.spyOn(console, 'warn');
    const ink = { width: 4, height: 4, data: new Uint8Array(16).fill(200) };
    const hits = new Float32Array([0, 0, 90, 0, 90, 0, 90, 90]);
    for (let round = 0; round < 2; round++) {
      view.scan.start();
      view.scan.show({ type: 'ink', ink });
      await wait(60);
      await new Promise<void>((resolve) => view.scan.lock(grids[0] as AlignmentResult, hits, resolve));
    }
    const still = new Promise<void>((resolve) => view.scan.whenStill(resolve));
    view.scan.cancel();
    await still;
    view.scan.destroy();

    expect(warned.mock.calls.flat().filter((part) => String(part).includes('[BindGroup]'))).toEqual([]);
    warned.mockRestore();
  });

  it('goes quietly when its view is closed under a running scan: the app is destroyed first', async () => {
    const view = await stage();
    view.scan.start();
    await wait(60);
    // What a closing view does: the app goes, with its ticker, while the panel still holds the scan.
    view.app.destroy(true, { children: true });
    expect(() => view.scan.destroy()).not.toThrow();
    open = null;
  });
});

