import { describe, expect, it } from 'vitest';
import { MAX_MAP_PIXELS, MAX_MAP_SIDE, mapLayout, maxPxPerCell, suggestedPxPerCell } from '../../../src/app/dungeons/render/layoutSize';
import { fittedPxPerCell } from '../../../src/app/dungeons/render/renderMap';
import { legibleStyle } from '../../../src/app/dungeons/render/legibleStyle';
import { createRenderEnv } from '../../../src/app/dungeons/render/renderEnv';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import type { Canvas2D } from '../../../src/app/dungeons/render/geometry';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { largeDungeon, smallDungeon } from '../../fixtures/dungeonModels';
import { addRoom, emptyModel, entryFloor } from '../../fixtures/dungeonModelBuilder';

/** Hatching only computes; no layer draws in these tests. */
const NO_CANVAS = {} as Canvas2D;

function crosses(s: readonly number[], i: number, j: number): boolean {
  const [ax, ay, bx, by] = [s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!];
  const [cx, cy, dx, dy] = [s[j]!, s[j + 1]!, s[j + 2]!, s[j + 3]!];
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

describe('the map layout of a dungeon of several floors', () => {
  it('lies around every floor, so every floor\'s image has the same size and origin', () => {
    const model = emptyModel(1);
    addRoom(entryFloor(model), { x: 0, y: 0, w: 4, h: 4 });
    const below = emptyModel(1);
    addRoom(entryFloor(below), { x: 10, y: -6, w: 3, h: 3 });
    const both = { ...model, floors: [entryFloor(model), entryFloor(below)] };
    const layout = mapLayout(both, 10);
    expect(layout.originCell).toEqual({ x: -2, y: -8 });
    expect([layout.cellsWide, layout.cellsHigh]).toEqual([17, 14]);
  });
});

describe('dungeon map size', () => {
  it('starts the image on a cell corner with whole cells of margin', () => {
    const layout = mapLayout(smallDungeon(), 100);
    expect(Number.isInteger(layout.originCell.x)).toBe(true);
    expect(Number.isInteger(layout.originCell.y)).toBe(true);
    expect(layout.widthPx).toBe(layout.cellsWide * 100);
  });

  it('keeps a huge dungeon within the image limits', () => {
    const model = emptyModel(1);
    addRoom(entryFloor(model), { x: 0, y: 0, w: 400, h: 250 });
    const px = maxPxPerCell(model);
    const layout = mapLayout(model, px);
    expect(Math.max(layout.widthPx, layout.heightPx)).toBeLessThanOrEqual(MAX_MAP_SIDE);
    expect(layout.widthPx * layout.heightPx).toBeLessThanOrEqual(MAX_MAP_PIXELS);
    expect(suggestedPxPerCell(model, 100)).toBe(px);
    expect(suggestedPxPerCell(smallDungeon(), 100)).toBe(100);
  });
});

describe('dungeon preview', () => {
  it('fits the whole map into the preview, on its tighter side', () => {
    const model = emptyModel(1);
    addRoom(entryFloor(model), { x: 0, y: 0, w: 3, h: 30 });
    const px = fittedPxPerCell(model, DEFAULT_VIEW, 1300, 400);
    const layout = mapLayout(model, px, DEFAULT_VIEW);
    expect(layout.widthPx).toBeLessThanOrEqual(1300);
    expect(layout.heightPx).toBeLessThanOrEqual(400);
    expect(layout.heightPx).toBeGreaterThan(398);
  });

  it('keeps the surroundings and strokes from shrinking to hairlines on a small map', () => {
    const style = dungeonStyle('parchment');
    expect(legibleStyle(style, 60)).toBe(style);
    const small = legibleStyle(style, 12);
    expect(small.surround.reach * 12).toBeGreaterThan(style.surround.reach * 12 * 1.3);
    expect(small.surround.reach * 12).toBeLessThan(style.surround.reach * 30);
    expect(small.strokes.normal).toBeGreaterThan(style.strokes.normal);
    // The wall's ink stays at least a pixel and more wide
    expect((small.strokes.thick / 30) * 12).toBeGreaterThanOrEqual(1.4);
  });
});
