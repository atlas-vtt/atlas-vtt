import { describe, expect, it } from 'vitest';
import type { ThemeChoice } from '../../src/app/dungeons/themes/themeTypes';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { parseHex } from '../../src/app/dungeons/render/palette';
import { fittedPxPerCell, renderMap } from '../../src/app/dungeons/render/renderMap';
import { renderThumbnail } from '../../src/app/dungeons/render/thumbnail';
import { DEFAULT_VIEW, type DungeonStyle, type DungeonView } from '../../src/app/dungeons/style';
import { DUNGEON_STYLES } from '../../src/app/dungeons/styleCatalog';
import { pixelStats, savePng, withoutText } from './dungeonRenderHarness';

/**
 * Every look of the gallery on three generated dungeons: the gallery's card, the preview, a
 * stretch of the scene map at 100 px per cell (what a table sees under its tokens), the card in
 * monochrome and the stretch with a solid grid, written to `out/dungeon-render/styles/` for a person to judge side by side.
 */

const DUNGEONS: readonly { name: string; seed: number; theme?: ThemeChoice; tags: string[] }[] = [
  { name: 'halls', seed: 16, tags: ['dry'] },
  { name: 'flooded', seed: 2024, theme: 'cavern', tags: ['flooded', 'winding'] },
  { name: 'fortress', seed: 404, theme: 'fortress', tags: ['round', 'colonnades', 'crumbling'] },
];

/** The gallery's card at a device pixel ratio of 2. */
const CARD = { width: 272, height: 204, legibleAt: 2 };
/** A stretch of the scene map at 100 px per cell. */
const TABLE = { width: 1100, height: 800, legibleAt: 1 };

const models = new Map<string, DungeonModel>();
function modelOf(name: string): DungeonModel {
  let model = models.get(name);
  if (!model) {
    const spec = DUNGEONS.find(d => d.name === name)!;
    model = generateDungeon({ seed: spec.seed, theme: spec.theme, tags: spec.tags, floors: 1 });
    models.set(name, model);
  }
  return model;
}

function thumbnail(model: DungeonModel, style: DungeonStyle, view: DungeonView, size: typeof CARD): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const { ctx, texts } = withoutText(canvas.getContext('2d')!);
  renderThumbnail(ctx, model, style, view, size);
  expect(texts).toEqual([]);
  return canvas;
}

function preview(model: DungeonModel, style: DungeonStyle): OffscreenCanvas {
  const pxPerCell = fittedPxPerCell(model, DEFAULT_VIEW, 1400, 1000);
  const layout = mapLayout(model, pxPerCell, DEFAULT_VIEW);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  const { ctx, texts } = withoutText(canvas.getContext('2d')!);
  renderMap(ctx, model, style, DEFAULT_VIEW, { pxPerCell, legibleAt: 1 });
  expect(texts).toEqual([]);
  return canvas;
}

function expectInked(canvas: OffscreenCanvas, style: DungeonStyle): void {
  const stats = pixelStats(canvas, parseHex(style.colors.ink));
  // Stone & shadow inks only the line where wall meets floor; Engraved cuts its rock in ink too
  expect(stats.ink).toBeGreaterThan(0.001);
  // Where the rock is solid ink, ink covers much of the picture by design
  if (style.colors.paper !== style.colors.ink) expect(stats.ink).toBeLessThan(0.6);
  expect(stats.transparent).toBe(0);
}

describe('the dungeon styles', () => {
  for (const { id, style } of DUNGEON_STYLES) {
    for (const { name } of DUNGEONS) {
      it(`draws the ${name} dungeon in ${id}`, async () => {
        const model = modelOf(name);
        const card = thumbnail(model, style, DEFAULT_VIEW, CARD);
        expectInked(card, style);
        await savePng(card, `styles/${name}-${id}-card`);
        const table = thumbnail(model, style, DEFAULT_VIEW, TABLE);
        expectInked(table, style);
        await savePng(table, `styles/${name}-${id}-table`);
        await savePng(preview(model, style), `styles/${name}-${id}-preview`);
        const mono = thumbnail(model, style, { ...DEFAULT_VIEW, monochrome: true }, CARD);
        expectInked(mono, style);
        await savePng(mono, `styles/${name}-${id}-mono`);
        const solid = thumbnail(model, style, { ...DEFAULT_VIEW, grid: 'solid', smallTiles: name === 'fortress' }, TABLE);
        expectInked(solid, style);
        await savePng(solid, `styles/${name}-${id}-solid`);
      });
    }
  }
});
