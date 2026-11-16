import { describe, expect, it } from 'vitest';
import type { ThemeChoice } from '../../src/app/dungeons/themes/themeTypes';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap, renderMapSvg } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { savePng } from './dungeonRenderHarness';

/**
 * The map saved as SVG against the map drawn on a canvas as the export draws it (`vector`: plain
 * paper, no textures, soft shadows or other pictures, holes painted as depth): the SVG, shown by
 * the browser, must be the same picture but for the edges antialiasing draws apart, and hold no text.
 */

const PX_PER_CELL = 30;

async function rasterise(svg: string, size: { width: number; height: number }): Promise<OffscreenCanvas> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = new OffscreenCanvas(size.width, size.height);
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The share of pixels whose colours differ by more than a faint edge would, and a picture of where. */
function difference(a: OffscreenCanvas, b: OffscreenCanvas): { share: number; picture: OffscreenCanvas } {
  const size = { width: a.width, height: a.height };
  const da = a.getContext('2d')!.getImageData(0, 0, size.width, size.height).data;
  const db = b.getContext('2d')!.getImageData(0, 0, size.width, size.height).data;
  const picture = new OffscreenCanvas(size.width, size.height);
  const out = picture.getContext('2d')!.createImageData(size.width, size.height);
  let differ = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!);
    const off = d > 96;
    if (off) differ++;
    out.data[i] = off ? 255 : da[i]! / 2 + 100;
    out.data[i + 1] = off ? 0 : da[i + 1]! / 2 + 100;
    out.data[i + 2] = off ? 0 : da[i + 2]! / 2 + 100;
    out.data[i + 3] = 255;
  }
  picture.getContext('2d')!.putImageData(out, 0, 0);
  return { share: differ / (da.length / 4), picture };
}

const CASES: readonly { name: string; seed: number; theme?: ThemeChoice; tags: string[]; styleId: DungeonStyleId }[] = [
  { name: 'default', seed: 458782179, tags: [], styleId: 'parchment' },
  { name: 'round', seed: 404, theme: 'fortress', tags: ['round', 'colonnades'], styleId: 'masonry' },
  { name: 'flooded', seed: 2024, theme: 'cavern', tags: ['flooded', 'winding'], styleId: 'slate' },
  { name: 'secret', seed: 515, tags: ['secret'], styleId: 'drafting' },
  { name: 'crumbling', seed: 202, tags: ['crumbling'], styleId: 'stipple' },
];

describe('the map as SVG', () => {
  for (const { name, seed, theme, tags, styleId } of CASES) {
    it(`draws the ${name} map in ${styleId} as the canvas does`, async () => {
      const model = generateDungeon({ seed, theme, tags, floors: 1 });
      const style = dungeonStyle(styleId);
      const size = mapLayout(model, PX_PER_CELL, DEFAULT_VIEW);
      const canvas = new OffscreenCanvas(size.widthPx, size.heightPx);
      const drawn = renderMap(canvas.getContext('2d')!, model, style, DEFAULT_VIEW, { pxPerCell: PX_PER_CELL, vector: true, openings: 'drawn' });
      const { svg, layout } = renderMapSvg(model, style, DEFAULT_VIEW, { pxPerCell: PX_PER_CELL });

      expect(layout).toEqual(drawn);
      expect(svg).not.toMatch(/NaN|undefined|Infinity|<text|@font-face/);
      const { share, picture } = difference(canvas, await rasterise(svg, { width: size.widthPx, height: size.heightPx }));
      await savePng(picture, `svg-diff-${name}-${styleId}`);
      expect(share).toBeLessThan(0.01);
    });
  }
});
