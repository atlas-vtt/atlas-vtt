// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Container, type Mesh } from 'pixi.js';
import { GridSystem } from '../../src/app/grid/GridSystem';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';
import { fakeMapImageView, settleGridColor } from '../helpers/fakeMapImageView';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

/** A viewport that says what it shows, in world units, and a ticker whose frames a test runs by hand. */
function stage(view: { x: number; y: number; width: number; height: number }): { viewport: Container; app: never; frame: () => void; look: (next: typeof view, zoom?: number) => void } {
  const viewport = Object.assign(new Container(), { getVisibleBounds: () => ({ ...view }) });
  const frames: Array<() => void> = [];
  const app = { renderer: { resolution: 1 }, ticker: { add: (fn: () => void) => frames.push(fn), remove: (fn: () => void) => frames.splice(frames.indexOf(fn), 1) } } as never;
  return {
    viewport,
    app,
    frame: () => { for (const fn of [...frames]) fn(); },
    look: (next, zoom) => { view = next; if (zoom !== undefined) viewport.scale.set(zoom); },
  };
}

const SIDE = 31622;

/** The grid's lines: one mesh. */
function lines(grid: GridSystem): Container {
  const found = grid.getGridSprite()!.getChildByLabel('grid-lines');
  expect(found).toBeDefined();
  return found!;
}

it('draws a dotted grid of a gigapixel map as one quad, whatever the view shows of it', async () => {
  restoreGraphics = stubJsdomGraphics();
  const { viewport, app, frame, look } = stage({ x: 10000, y: 12000, width: 1500, height: 900 });
  const map = fakeMapImageView(SIDE, SIDE);
  viewport.addChild(map.layer);
  const grid = new GridSystem(app, viewport as never, map, { type: 'square', size: 8, lineType: 'dotted' });
  try {
    await settleGridColor();
    const mesh = lines(grid) as Mesh;
    expect(mesh.geometry.getBuffer('aPosition').data).toHaveLength(8);
    // The quad is the map with a cell of padding: a 31,622 px map, four million cells, is four corners.
    expect([...mesh.geometry.getBuffer('aPosition').data]).toEqual([0, 0, SIDE + 16, 0, SIDE + 16, SIDE + 16, 0, SIDE + 16]);
    const before = grid.getGridSprite();
    look({ x: 0, y: 0, width: SIDE, height: SIDE }, 0.05);
    frame();
    look({ x: 20000, y: 12000, width: 150, height: 90 }, 10);
    frame();
    // Nothing is drawn again for a view: the shader reads each render's own camera.
    expect(grid.getGridSprite()).toBe(before);
    expect(lines(grid)).toBe(mesh);
  } finally { grid.destroy(); }
});

/** The cell numbers the grid shows, by their text. */
function shownNumbers(grid: GridSystem): readonly string[] {
  expect(grid.getGridSprite()!.children.find((child) => child.label === 'cell-numbers')).toBeDefined();
  return grid.cellLabels();
}

it('numbers no cell while the numbers are too small to read', async () => {
  restoreGraphics = stubJsdomGraphics();
  // The whole gigapixel map in view: 31,622 / 8 cells across, far past the marks a region may hold.
  const { viewport, app } = stage({ x: 0, y: 0, width: SIDE, height: SIDE });
  const map = fakeMapImageView(SIDE, SIDE);
  viewport.addChild(map.layer);
  const grid = new GridSystem(app, viewport as never, map, { type: 'square', size: 8, lineType: 'dotted', cellNumbers: { format: 'column-row', opacity: 0.8 } });
  try {
    await settleGridColor();
    expect(shownNumbers(grid)).toEqual([]);
  } finally { grid.destroy(); }
});

it('numbers the cells in and around the view of a gigapixel map once they can be read, as the whole map numbers them', async () => {
  restoreGraphics = stubJsdomGraphics();
  const { viewport, app, frame, look } = stage({ x: 0, y: 0, width: SIDE, height: SIDE });
  const map = fakeMapImageView(SIDE, SIDE);
  viewport.addChild(map.layer);
  const grid = new GridSystem(app, viewport as never, map, { type: 'square', size: 8, cellNumbers: { format: 'column-row', opacity: 0.8 } });
  try {
    await settleGridColor();
    // Zoom 8: a 1,500 × 900 screen shows 187.5 × 112.5 world pixels, about 23 × 14 cells.
    look({ x: 10000, y: 12000, width: 187.5, height: 112.5 }, 8);
    frame();
    const numbers = shownNumbers(grid);
    // The view with its longer side on every side: 562.5 × 487.5 world pixels, some 70 × 61 cells, not 3,953².
    expect(numbers.length).toBeGreaterThan(70 * 60);
    expect(numbers.length).toBeLessThan(72 * 63);
    // Cell 1250, 1500 is column 1251, row 1501 of a map 3,953 cells wide: four digits each.
    expect(numbers).toContain('12511501');
    look({ x: 0, y: 0, width: SIDE, height: SIDE }, 1);
    frame();
    expect(shownNumbers(grid)).toEqual([]);
  } finally { grid.destroy(); }
});
