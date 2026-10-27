import { describe, expect, it } from 'vitest';
import type { DungeonModel } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { parseHex } from '../../src/app/dungeons/render/palette';
import { DEFAULT_VIEW, type DungeonView, type GridStyle } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { DUNGEON_FIXTURES } from '../fixtures/dungeonModels';
import { pixelStats, savePng, withoutText } from './dungeonRenderHarness';

/**
 * Renders the fixtures in a style of each kind, grid style and view, checks the pictures are sane, in
 * time and free of text, and writes them as PNGs to `out/dungeon-render/` for a person to look at.
 */

/** One style of each kind of surroundings, and a dark one; every style is drawn in `dungeonStyles.gpu.test.ts`. */
const STYLES = ['parchment', 'masonry', 'stipple', 'drafting', 'slate', 'night'] as const satisfies readonly DungeonStyleId[];
const GRIDS: GridStyle[] = ['off', 'dotted', 'dashed', 'solid', 'broken'];
const FIXTURES = Object.keys(DUNGEON_FIXTURES) as (keyof typeof DUNGEON_FIXTURES)[];

/** A large dungeon at 100 px per cell must render in this long. */
const MAP_BUDGET_MS = 1500;

function drawMap(model: DungeonModel, styleId: DungeonStyleId, view: DungeonView, pxPerCell: number): { canvas: OffscreenCanvas; ms: number } {
  const layout = mapLayout(model, pxPerCell, view);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  const started = performance.now();
  const real = canvas.getContext('2d')!;
  const { ctx, texts } = withoutText(real);
  renderMap(ctx, model, dungeonStyle(styleId), view, { pxPerCell });
  expect(texts).toEqual([]);
  // Reading a pixel waits for the drawing to reach the canvas, so the time is the whole render.
  real.getImageData(0, 0, 1, 1);
  return { canvas, ms: performance.now() - started };
}

function expectSane(canvas: OffscreenCanvas, styleId: DungeonStyleId): void {
  const stats = pixelStats(canvas, parseHex(dungeonStyle(styleId).colors.ink));
  // Stone & shadow inks only the line where wall meets floor; Engraved cuts its rock in ink too
  expect(stats.ink).toBeGreaterThan(0.001);
  expect(stats.ink).toBeLessThan(0.6);
  expect(stats.colours).toBeGreaterThan(4);
  expect(stats.transparent).toBe(0);
}

describe('dungeon renderer', () => {
  for (const fixture of FIXTURES) {
    for (const styleId of STYLES) {
      it(`draws the ${fixture} map in ${styleId}`, async () => {
        const model = DUNGEON_FIXTURES[fixture]();
        const { canvas, ms } = drawMap(model, styleId, DEFAULT_VIEW, fixture === 'large' ? 100 : 60);
        expectSane(canvas, styleId);
        if (fixture === 'large') expect(ms).toBeLessThan(MAP_BUDGET_MS);
        await savePng(canvas, `map-${fixture}-${styleId}`);
      });
    }
  }

  for (const grid of GRIDS) {
    for (const smallTiles of [false, true]) {
      it(`draws a ${grid} grid${smallTiles ? ' in small tiles' : ''}`, async () => {
        const { canvas } = drawMap(DUNGEON_FIXTURES.small(), 'parchment', { ...DEFAULT_VIEW, grid, smallTiles }, 60);
        expectSane(canvas, 'parchment');
        await savePng(canvas, `grid-${grid}${smallTiles ? '-small' : ''}`);
      });
    }
  }

  const variants: [string, Partial<DungeonView>][] = [
    ['monochrome', { monochrome: true }],
    ['no-secrets', { secrets: false }],
    ['bare', { water: false, props: false, shadow: false }],
  ];
  for (const [name, change] of variants) {
    it(`draws the ${name} map`, async () => {
      const { canvas } = drawMap(DUNGEON_FIXTURES.small(), 'parchment', { ...DEFAULT_VIEW, ...change }, 60);
      expectSane(canvas, 'parchment');
      await savePng(canvas, `view-${name}`);
    });
  }

  it('leaves a transparent map transparent outside the drawing', () => {
    const model = DUNGEON_FIXTURES.small();
    const layout = mapLayout(model, 40);
    const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
    renderMap(canvas.getContext('2d')!, model, dungeonStyle('parchment'), DEFAULT_VIEW, { pxPerCell: 40, transparent: true });
    const corner = canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data;
    expect(corner[3]).toBe(0);
  });
});
