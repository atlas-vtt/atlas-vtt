import { describe, expect, it } from 'vitest';
import { fogScenes } from '../helpers/fogCoverageScene';
import { getHistoryStore } from '../../src/app/stores/history';
import type { ViewAtlasStore } from '../../src/app/storeFactory';

const { scene } = fogScenes();

/** How far two pictures of the same fog may differ at a pixel: an edge is anti-aliased once from the shape drawn, once from the fog's own outline. */
const EDGE_SLACK = 40;

/** The pixels at which two pictures differ by more than an edge's anti-aliasing. */
function differing(a: readonly number[], b: readonly number[]): number {
  return a.filter((value, index) => Math.abs(value - b[index]!) > EDGE_SLACK).length;
}

const covered = (frame: readonly number[]): number => frame.filter((value) => value < 128).length;
const at = (frame: readonly number[], x: number, y: number): number => frame[y * 128 + x]!;

/** Gives the scene a grid, as part of its setup: no undo step. */
function withGrid(store: ViewAtlasStore, type: 'square' | 'hex-vertical' | 'hex-horizontal', size: number, offset = 0): void {
  store.setState((state) => ({ grid: { ...state.grid, type, size, offsetX: offset, offsetY: offset, snapToGrid: true } }));
  store.temporal.getState().clear();
}

/** The map the scenes show: with one, the fog's canvas lies where the map does, whatever fog there is. */
const MAP = { x: 0, y: 0, width: 128, height: 128 };

/**
 * Places on the two lines where the rows of a ring of 16 px cells from (17, 17) to (65, 65) meet.
 * The lines lie at 33 and 49, in the middle of a pixel of the fog's canvas, which is drawn at
 * half the map's size: two shapes that each cover half of that pixel leave it lighter.
 */
const ROW_SEAMS = [[24, 32], [24, 33], [24, 48], [24, 49], [56, 32], [56, 33], [56, 48], [56, 49]] as const;

/** The whole map hidden. */
const COVER = { all: { id: 'all', kind: 'fog', timestamp: 1, type: 'rectangle', isErasing: false, x: 0, y: 0, width: 128, height: 128 } } as const;

/** Whether a pixel of the GM's canvas is tinted red, as the wash over what a shape will reveal is: the fog and the map are grey. */
function washed(pixels: Uint8ClampedArray, x: number, y: number): boolean {
  const index = (y * 128 + x) * 4;
  return pixels[index]! - pixels[index + 1]! > 20;
}

/** The pixels at which two pictures differ in any channel by more than a rounding. */
function changed(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let count = 0;
  for (let index = 0; index < a.length; index += 4) {
    if ([0, 1, 2].some((channel) => Math.abs(a[index + channel]! - b[index + channel]!) > 8)) count++;
  }
  return count;
}

const escape = (): boolean => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

const enter = (): boolean => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

describe('the fog tool\'s shapes on the map', () => {
  it('commits the fog a polygon showed while it was placed, in one undo step', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    withGrid(s.store, 'square', 16);
    s.store.getState().setActiveTool('fog');
    s.store.getState().setFogTool({ shape: 'polygon' });
    const click = (x: number, y: number): void => {
      s.pointer('pointerdown', x, y);
      s.pointer('pointerup', x, y);
    };
    // Corners land on the 16 px grid's.
    click(17, 15);
    click(95, 17);
    click(97, 94);
    // Two edges and the pointer: an L is not yet what will be hidden, the pointer's corner is.
    s.pointer('pointermove', 50, 98);
    const shown = s.frame();
    expect(at(shown, 80, 40)).toBe(0);
    expect(at(shown, 30, 80)).toBe(255);
    expect(at(shown, 110, 110)).toBe(255);
    expect(s.store.getState().objects.fog).toEqual({});
    click(50, 98);
    s.pointer('pointermove', 30, 60);
    const beforeClosing = s.frame();
    click(30, 60);
    // The last corner lies where the pointer showed it: closing changes nothing of the picture.
    enter();
    const fog = Object.values(s.store.getState().objects.fog);
    expect(fog).toMatchObject([{ type: 'lasso', isErasing: false, points: [{ x: 16, y: 16 }, { x: 96, y: 16 }, { x: 96, y: 96 }, { x: 48, y: 96 }, { x: 32, y: 64 }] }]);
    const committed = s.frame();
    expect(covered(committed)).toBeGreaterThan(3000);
    expect(differing(beforeClosing, committed)).toBe(0);
    expect(at(committed, 80, 40)).toBe(0);
    expect(at(committed, 22, 90)).toBe(255);

    const history = getHistoryStore(s.store)!;
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(covered(s.frame())).toBe(0);
  });

  it('reveals with a polygon closed on its first corner: the players see the hole only once it is closed, the GM what will go', async () => {
    const s = await scene({ ...COVER });
    s.showMapImage(MAP);
    withGrid(s.store, 'square', 16);
    s.store.getState().setActiveTool('eraser');
    s.store.getState().setFogTool({ shape: 'polygon' });
    const before = s.frame();
    expect(covered(before)).toBe(128 * 128);
    for (const [x, y] of [[32, 32], [96, 32], [64, 96]] as const) {
      s.pointer('pointerdown', x, y);
      s.pointer('pointerup', x, y);
    }
    s.pointer('pointermove', 34, 30);
    // The polygon is a shape now, and nothing of it is the players' yet.
    expect(s.frame()).toEqual(before);
    const gm = s.rgba();
    expect([washed(gm, 64, 50), washed(gm, 20, 90), washed(gm, 110, 110)]).toEqual([true, false, false]);
    s.pointer('pointerdown', 34, 30);
    s.pointer('pointerup', 34, 30);
    expect(Object.values(s.store.getState().objects.fog)).toHaveLength(2);
    const committed = s.frame();
    expect(at(committed, 64, 50)).toBe(255);
    expect(at(committed, 20, 90)).toBe(0);
    expect(washed(s.rgba(), 64, 50)).toBe(false);
  });

  it('shows the players nothing of a rectangle that will reveal while it is dragged, pulled back or dropped: the GM alone sees what will go', async () => {
    const s = await scene({ ...COVER });
    s.showMapImage(MAP);
    withGrid(s.store, 'square', 16);
    s.store.getState().setActiveTool('eraser');
    s.store.getState().setFogTool({ shape: 'rectangle' });
    const before = s.frame();
    const gmBefore = s.rgba();
    const pictureBefore = s.rgba(s.fog.getGmViewLayers());
    expect(covered(before)).toBe(128 * 128);

    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 96, 80);
    // The players' picture is, pixel for pixel, what it was before the press.
    expect(s.frame()).toEqual(before);
    // The GM's canvas shows what the rectangle will reveal as a wash, and a picture of the scene none.
    const dragged = s.rgba();
    expect([washed(dragged, 64, 56), washed(dragged, 40, 72), washed(dragged, 16, 100), washed(dragged, 110, 56)]).toEqual([true, true, false, false]);
    expect(changed(s.rgba(s.fog.getGmViewLayers()), pictureBefore)).toBe(0);

    // Pulled back: the wash follows the pointer, and the players still see nothing of it.
    s.pointer('pointermove', 48, 48);
    expect(s.frame()).toEqual(before);
    const pulledBack = s.rgba();
    expect([washed(pulledBack, 40, 40), washed(pulledBack, 64, 56)]).toEqual([true, false]);

    // Dropped: both pictures are what they were.
    escape();
    expect(s.frame()).toEqual(before);
    expect(changed(s.rgba(), gmBefore)).toBe(0);
    s.pointer('pointerup', 48, 48);
    expect(Object.keys(s.store.getState().objects.fog)).toEqual(['all']);

    // Released, the rectangle is revealed, and the wash is gone.
    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 96, 80);
    s.pointer('pointerup', 96, 80);
    const committed = s.frame();
    expect([at(committed, 64, 56), at(committed, 40, 72), at(committed, 16, 100), at(committed, 110, 56)]).toEqual([255, 255, 0, 0]);
    expect(washed(s.rgba(), 64, 56)).toBe(false);
    getHistoryStore(s.store)!.getState().undo();
    expect(s.frame()).toEqual(before);
  });

  it('shows the players a rectangle that will hide at once, and the brush as it wipes fog away', async () => {
    const s = await scene({ ...COVER });
    s.showMapImage(MAP);
    withGrid(s.store, 'square', 16);
    s.store.getState().setFogTool({ shape: 'brush', brushSize: 10 });
    s.store.getState().setActiveTool('eraser');
    s.pointer('pointerdown', 40, 40);
    s.pointer('pointermove', 80, 40);
    // The brush is live: what it wiped is clear before the release.
    expect(at(s.frame(), 60, 40)).toBe(255);
    s.pointer('pointerup', 80, 40);
    expect(at(s.frame(), 60, 40)).toBe(255);

    s.store.getState().setFogTool({ shape: 'rectangle' });
    s.store.getState().setActiveTool('fog');
    s.pointer('pointerdown', 32, 32);
    s.pointer('pointermove', 96, 80);
    expect(at(s.frame(), 60, 40)).toBe(0);
    expect(washed(s.rgba(), 64, 56)).toBe(false);
    escape();
    expect(at(s.frame(), 60, 40)).toBe(255);
  });

  it('commits the fog a drag over cells showed, squares round a hole without a seam between their rows', async () => {
    const s = await scene();
    s.showMapImage(MAP);
    withGrid(s.store, 'square', 16, 1);
    s.store.getState().setActiveTool('fog');
    s.store.getState().setFogTool({ shape: 'cells' });
    // Round the cell from (33, 33) to (49, 49): three cells a side.
    s.pointer('pointerdown', 24, 24);
    for (const [x, y] of [[56, 24], [56, 56], [24, 56], [24, 40]] as const) s.pointer('pointermove', x, y);
    const shown = s.frame();
    expect(s.store.getState().objects.fog).toEqual({});
    // The ring is hidden, the cell in its middle and the map around it are not.
    expect(at(shown, 24, 24)).toBe(0);
    expect(at(shown, 56, 40)).toBe(0);
    expect(at(shown, 40, 40)).toBe(255);
    expect(at(shown, 8, 8)).toBe(255);
    expect(at(shown, 72, 40)).toBe(255);
    // Where the rows meet no line shows through: the shapes are drawn as one.
    for (const [x, y] of ROW_SEAMS) expect(at(shown, x, y)).toBe(0);
    s.pointer('pointerup', 24, 40);
    expect(Object.values(s.store.getState().objects.fog)).toHaveLength(4);
    const committed = s.frame();
    expect(differing(shown, committed)).toBe(0);
    expect(covered(committed)).toBeGreaterThan(1900);
    for (const [x, y] of ROW_SEAMS) expect(at(committed, x, y)).toBe(0);

    const history = getHistoryStore(s.store)!;
    expect(history.getState().pastStates).toHaveLength(1);
    history.getState().undo();
    expect(covered(s.frame())).toBe(0);
  });

  it('commits the fog a drag over hexes showed, for pointed and for flat tops', async () => {
    for (const type of ['hex-vertical', 'hex-horizontal'] as const) {
      const s = await scene();
      s.showMapImage(MAP);
      withGrid(s.store, type, 32);
      s.store.getState().setActiveTool('fog');
      s.store.getState().setFogTool({ shape: 'cells' });
      s.pointer('pointerdown', 20, 20);
      s.pointer('pointermove', 100, 30);
      s.pointer('pointermove', 90, 100);
      const shown = s.frame();
      // Whole hexes: far more than the line the pointer drew, and nothing of the map's far corner.
      expect(covered(shown)).toBeGreaterThan(4 * 800);
      expect(at(shown, 20, 20)).toBe(0);
      expect(at(shown, 90, 100)).toBe(0);
      expect(at(shown, 16, 110)).toBe(255);
      s.pointer('pointerup', 90, 100);
      const fog = Object.values(s.store.getState().objects.fog);
      expect(fog).toHaveLength(1);
      expect(fog[0]).toMatchObject({ type: 'lasso', isErasing: false });
      expect(differing(shown, s.frame())).toBe(0);
    }
  });
});
