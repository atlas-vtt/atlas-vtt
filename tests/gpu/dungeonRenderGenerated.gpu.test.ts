import { describe, expect, it } from 'vitest';
import type { ThemeChoice } from '../../src/app/dungeons/themes/themeTypes';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { parseHex } from '../../src/app/dungeons/render/palette';
import { filledPockets, inPocket } from '../../src/app/dungeons/render/pockets';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { fittedPxPerCell, renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW, type DungeonView } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { pixelStats, savePng, withoutText } from './dungeonRenderHarness';

/**
 * Real dungeons from the generator, over seeds and tags, drawn as the preview shows them and as
 * scene maps in a style of each kind, without any text, and written to `out/dungeon-render/` as
 * `gen-*.png` for a person to look at.
 */

/** One style of each kind of surroundings, and a dark one; every style is drawn in `dungeonStyles.gpu.test.ts`. */
const STYLES = ['parchment', 'masonry', 'stipple', 'drafting', 'slate', 'night'] as const satisfies readonly DungeonStyleId[];

/** A large dungeon at 100 px per cell must render in this long. */
const MAP_BUDGET_MS = 1500;

const CASES: readonly { name: string; seed: number; theme?: ThemeChoice; tags: string[] }[] = [
  { name: 'default', seed: 16, tags: [] },
  { name: 'small', seed: 31337, tags: ['small'] },
  { name: 'large', seed: 777, tags: ['large'] },
  { name: 'ordered', seed: 101, tags: ['ordered'] },
  { name: 'chaotic', seed: 102, tags: ['chaotic'] },
  { name: 'round', seed: 404, theme: 'fortress', tags: ['round', 'colonnades'] },
  { name: 'colonnades', seed: 405, tags: ['colonnades', 'large'] },
  { name: 'flooded', seed: 2024, theme: 'cavern', tags: ['flooded', 'winding'] },
  { name: 'crumbling', seed: 202, tags: ['crumbling'] },
  { name: 'fortress', seed: 777, theme: 'fortress', tags: ['colonnades'] },
  { name: 'cavern', seed: 909, theme: 'cavern', tags: [] },
  { name: 'mansion', seed: 303, theme: 'mansion', tags: ['deep'] },
  { name: 'secret', seed: 515, tags: ['secret'] },
  { name: 'string', seed: 616, tags: ['string'] },
  { name: 'compact', seed: 717, tags: ['compact'] },
  { name: 'winding', seed: 818, tags: ['winding', 'wet'] },
  { name: 'medium', seed: 1020, tags: ['medium'] },
  { name: 'large-flooded', seed: 1121, tags: ['large', 'flooded', 'round'] },
  { name: 'small-ordered', seed: 1222, tags: ['small', 'ordered'] },
];

const models = new Map<string, DungeonModel>();
function modelOf(name: string): DungeonModel {
  let model = models.get(name);
  if (!model) {
    const spec = CASES.find(c => c.name === name)!;
    model = generateDungeon({ seed: spec.seed, theme: spec.theme, tags: spec.tags, floors: 1 });
    models.set(name, model);
  }
  return model;
}

/** Stone & shadow inks only the line where wall meets floor; Engraved cuts its rock in ink too. */
const LEAST_INK = 0.001;

function expectSane(canvas: OffscreenCanvas, styleId: DungeonStyleId): void {
  const stats = pixelStats(canvas, parseHex(dungeonStyle(styleId).colors.ink));
  expect(stats.ink).toBeGreaterThan(LEAST_INK);
  expect(stats.ink).toBeLessThan(0.6);
  expect(stats.transparent).toBe(0);
}

/** The map fitted into a 1400 × 1000 preview, as the generator's panel draws it. */
function preview(model: DungeonModel, styleId: DungeonStyleId, view: DungeonView): OffscreenCanvas {
  const pxPerCell = fittedPxPerCell(model, view, 1400, 1000);
  const layout = mapLayout(model, pxPerCell, view);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  const { ctx, texts } = withoutText(canvas.getContext('2d')!);
  renderMap(ctx, model, dungeonStyle(styleId), view, { pxPerCell, legibleAt: 1 });
  expect(texts).toEqual([]);
  expect(Math.max(layout.widthPx / 1400, layout.heightPx / 1000)).toBeGreaterThan(0.99);
  return canvas;
}

function map(model: DungeonModel, styleId: DungeonStyleId, pxPerCell: number, view: DungeonView = DEFAULT_VIEW): { canvas: OffscreenCanvas; ms: number } {
  const layout = mapLayout(model, pxPerCell, view);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  const started = performance.now();
  const real = canvas.getContext('2d')!;
  const { ctx, texts } = withoutText(real);
  renderMap(ctx, model, dungeonStyle(styleId), view, { pxPerCell });
  expect(texts).toEqual([]);
  real.getImageData(0, 0, 1, 1);
  return { canvas, ms: performance.now() - started };
}

/** Points of rock the rooms close in on that the drawing left the colour of the paper. */
function paperInPockets(canvas: OffscreenCanvas, model: DungeonModel, styleId: DungeonStyleId, pxPerCell: number): string[] {
  const style = dungeonStyle(styleId);
  const dungeon = visibleDungeon(model, DEFAULT_VIEW);
  const pockets = filledPockets(dungeon, style.surround.reach);
  const { originCell } = mapLayout(model, pxPerCell, DEFAULT_VIEW);
  const ctx = canvas.getContext('2d')!;
  const [pr, pg, pb] = parseHex(style.colors.paper);
  const out: string[] = [];
  for (const { bounds } of pockets) {
    for (let y = bounds.minY; y < bounds.maxY; y += 0.1) {
      for (let x = bounds.minX; x < bounds.maxX; x += 0.1) {
        if (!inPocket(pockets, x, y) || dungeon.field.distance(x, y) < 0.2) continue;
        // A patch of paper, not one pixel: an inked edge blended over the shading can match the paper's colour
        const patch = ctx.getImageData(Math.floor((x - originCell.x) * pxPerCell) - 1, Math.floor((y - originCell.y) * pxPerCell) - 1, 3, 3).data;
        let paper = true;
        for (let i = 0; i < patch.length; i += 4) paper &&= Math.abs(patch[i]! - pr) + Math.abs(patch[i + 1]! - pg) + Math.abs(patch[i + 2]! - pb) < 6;
        if (paper) out.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
    }
  }
  return out;
}

describe('generated dungeons', () => {
  for (const { name } of CASES) {
    it(`draws the ${name} preview in parchment`, async () => {
      const canvas = preview(modelOf(name), 'parchment', DEFAULT_VIEW);
      expectSane(canvas, 'parchment');
      await savePng(canvas, `gen-preview-${name}-parchment`);
    });
  }

  for (const name of ['default', 'large', 'round', 'flooded', 'crumbling'] as const) {
    for (const styleId of STYLES.filter(p => p !== 'parchment')) {
      it(`draws the ${name} preview in ${styleId}`, async () => {
        const canvas = preview(modelOf(name), styleId, DEFAULT_VIEW);
        expectSane(canvas, styleId);
        await savePng(canvas, `gen-preview-${name}-${styleId}`);
      });
    }
  }

  for (const name of ['default', 'round', 'flooded'] as const) {
    for (const styleId of STYLES) {
      it(`draws the ${name} map in ${styleId}`, async () => {
        const { canvas } = map(modelOf(name), styleId, 100);
        expectSane(canvas, styleId);
        if (name === 'default') expect(filledPockets(visibleDungeon(modelOf(name), DEFAULT_VIEW), 0.5).length).toBeGreaterThan(0);
        // Stippling thins out on its own and fills no rock whole.
        if (dungeonStyle(styleId).surround.mode !== 'dots') expect(paperInPockets(canvas, modelOf(name), styleId, 100)).toEqual([]);
        await savePng(canvas, `gen-map-${name}-${styleId}`);
      });
    }
  }

  it('draws a large map at 100 px per cell in time', async () => {
    let worst = 0;
    for (const name of ['large', 'colonnades', 'large-flooded']) {
      const { canvas, ms } = map(modelOf(name), 'parchment', 100);
      worst = Math.max(worst, ms);
      if (name === 'large') await savePng(canvas, `gen-map-${name}-parchment`);
    }
    expect(worst).toBeLessThan(MAP_BUDGET_MS);
  });

  const views: [string, Partial<DungeonView>][] = [
    ['monochrome', { monochrome: true }],
    ['no-secrets', { secrets: false }],
  ];
  for (const [label, change] of views) {
    it(`draws the secret preview as ${label}`, async () => {
      const canvas = preview(modelOf('secret'), 'parchment', { ...DEFAULT_VIEW, ...change });
      expectSane(canvas, 'parchment');
      await savePng(canvas, `gen-view-${label}`);
    });
  }
});
