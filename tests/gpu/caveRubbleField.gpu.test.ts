import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import type { CellPoint, DungeonModel, DungeonTerrain } from '../../src/app/dungeons/model';
import { buildArtScene } from '../../src/app/dungeons/render/art/artScene';
import type { Hand } from '../../src/app/dungeons/render/art/hand';
import { grown } from '../../src/app/dungeons/render/art/paths';
import { crayonBox } from '../../src/app/dungeons/render/crayon/crayonBox';
import { crayonHand } from '../../src/app/dungeons/render/crayon/hand';
import { crayonPens } from '../../src/app/dungeons/render/crayon/pens';
import { engravedHand } from '../../src/app/dungeons/render/engraved/hand';
import { pensOf } from '../../src/app/dungeons/render/engraved/pens';
import { createRenderEnv } from '../../src/app/dungeons/render/renderEnv';
import { renderMapSvg } from '../../src/app/dungeons/render/renderMap';
import { stoneColours } from '../../src/app/dungeons/render/stone/colours';
import { stoneHand } from '../../src/app/dungeons/render/stone/hand';
import { drawTerrainGround, type TerrainColours } from '../../src/app/dungeons/render/terrain/drawTerrain';
import { cellGround, raggedGround, type ScatterGround } from '../../src/app/dungeons/render/terrain/scatterPatch';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW, type ArtDirection } from '../../src/app/dungeons/style';
import { DUNGEON_STYLES, dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { draft } from '../../src/app/dungeons/terrain/catalog';
import { addRoom, emptyModel } from '../fixtures/dungeonModelBuilder';
import { savePng } from './dungeonRenderHarness';
import { drawWindow, pathCount } from './glyphSheetChecks';

/**
 * A rubble field on a cave floor is one ragged patch, its tint fading at the edge, where a built
 * floor keeps its field of whole cells. A built floor's field is held to the picture it had
 * before the cave's was drawn: `VITE_RUBBLE_REFERENCE=write` writes that picture of every look to
 * `out/rubble-reference/`, and every later run compares with it, pixel for pixel. Pictures of both
 * go to `out/dungeon-render/rubble-field/`; what a 70-cell field costs per painter, whole on
 * either floor and its patch alone, to `out/perf-glyph/rubbleField.txt`.
 */

const PX = 100;
const REFERENCE = 'out/rubble-reference';
const WINDOW = { x: -1, y: -1, cells: 16, rows: 12 };
/** The most a 70-cell field's ragged patch may add to its stones, per painter, in milliseconds. */
const FIELD_BUDGET_MS = 3;
const FIELD_CELLS = 70;

/** A ragged field of `count` cells grown from the room's middle, with a few cells left out for the heaps that stand in it. */
function fieldCells(count: number): CellPoint[] {
  const heaps = new Set(['6,4', '9,6', '5,7']);
  const cells: CellPoint[] = [];
  for (let r = 0; cells.length < count && r < 10; r++) {
    for (let y = 5 - r; y <= 5 + r; y++) {
      for (let x = 7 - r; x <= 7 + r; x++) {
        if (cells.length >= count || x < 1 || y < 1 || x > 13 || y > 9) continue;
        // A wobbling boundary: farther along one diagonal than the other.
        if (Math.abs(x - 7) + Math.abs(y - 5) * 1.4 + ((x * 7 + y * 3) % 3) * 0.6 > r + 1) continue;
        const key = `${x},${y}`;
        if (heaps.has(key) || cells.some((c) => c.x === x && c.y === y)) continue;
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function fieldModel(cave: boolean): DungeonModel {
  const model = emptyModel(53);
  const floor = model.floors[0]!;
  if (cave) {
    model.theme = 'cavern';
    floor.cave = { lane: [], heights: [0], faults: [], basins: [], streams: [], dams: [] };
  }
  addRoom(floor, { x: 0, y: 0, w: 15, h: 11 });
  floor.terrain.push({ id: 0, ...draft('rubble-field', 0, fieldCells(FIELD_CELLS)) });
  return model;
}

async function pngOf(canvas: OffscreenCanvas): Promise<string> {
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Pixels of two PNGs that differ, read back through the browser's decoder. */
async function differingPixels(a: string, b: string): Promise<number> {
  const decode = async (png: string): Promise<Uint8ClampedArray> => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return canvas.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height).data;
  };
  const [x, y] = await Promise.all([decode(a), decode(b)]);
  if (x.length !== y.length) return Infinity;
  let differ = 0;
  for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2] || x[i + 3] !== y[i + 3]) differ++;
  return differ;
}

/** A painter's hand over a canvas of the field's room at `PX`, and the colours its terrain takes. */
function handOf(model: DungeonModel, look: string): { hand: Hand; canvas: OffscreenCanvas; colours: TerrainColours } {
  const canvas = new OffscreenCanvas(15 * PX, 11 * PX);
  const ctx = canvas.getContext('2d')!;
  const style = dungeonStyle(look);
  const env = createRenderEnv(ctx, visibleDungeon(model, DEFAULT_VIEW), style, DEFAULT_VIEW, PX);
  ctx.scale(PX, PX);
  const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: canvas.width, heightPx: canvas.height, pxPerCell: PX }, [], false);
  if (style.direction === 'stone') {
    const c = stoneColours(env.palette, false);
    return { hand: stoneHand(scene, c), canvas, colours: { water: c.water, cloth: c.cloth } };
  }
  const pens = style.direction === 'crayon' ? crayonPens(scene) : pensOf(scene);
  const hand = style.direction === 'crayon' ? crayonHand(scene, pens, crayonBox(scene)) : engravedHand(scene, pens);
  return { hand, canvas, colours: { water: pens.water, cloth: pens.floor } };
}

/** Milliseconds one drawing takes on a painter's hand: the middle of five runs of twenty, a pixel read to wait for the canvas. */
function costOf(model: DungeonModel, look: string, draw: (hand: Hand, colours: TerrainColours) => void): number {
  const { hand, canvas, colours } = handOf(model, look);
  const read = canvas.getContext('2d')!;
  const draws = 20;
  const runs: number[] = [];
  for (let run = 0; run < 5; run++) {
    const started = performance.now();
    for (let i = 0; i < draws; i++) draw(hand, colours);
    read.getImageData(0, 0, 1, 1);
    runs.push((performance.now() - started) / draws);
  }
  return runs.sort((a, b) => a - b)[2]!;
}

/** The field's ground laid alone, without its stones: its tint over `ground`. */
function toneOver(ground: (hand: Hand) => ScatterGround): (hand: Hand) => void {
  return (hand) => {
    const { field, bounds, clip } = ground(hand);
    hand.tone(field, grown(bounds, 0.1), clip, 'shade');
  };
}

const fieldPiece = (hand: Hand): DungeonTerrain => hand.scene.env.dungeon.floor.terrain[0]!;
const ragged = (hand: Hand): ScatterGround => raggedGround(hand.scene, fieldPiece(hand));

const PAINTERS: Record<ArtDirection, string> = { stone: 'parchment', engraved: 'print', crayon: 'crayon' };

describe('rubble fields', () => {
  it('draws a built floor\'s field as it was, in every look', async () => {
    const write = (import.meta.env as Record<string, string | undefined>).VITE_RUBBLE_REFERENCE === 'write';
    const changed: string[] = [];
    for (const { id: look } of DUNGEON_STYLES) {
      const drawn = drawWindow(fieldModel(false), dungeonStyle(look), DEFAULT_VIEW, PX, WINDOW);
      expect(drawn.texts).toEqual([]);
      await savePng(drawn.canvas, `rubble-field/built-${look}`);
      const png = await pngOf(drawn.canvas);
      if (write) {
        await commands.writeFile(`${REFERENCE}/built-${look}.png`, png, 'base64');
        continue;
      }
      const reference = await commands.readFile(`${REFERENCE}/built-${look}.png`, 'base64');
      if (reference !== png) changed.push(`${look}: ${await differingPixels(reference, png)} pixels differ`);
    }
    expect(changed).toEqual([]);
  });

  it('draws a cave floor\'s field as one ragged patch, in every look', async () => {
    for (const { id: look } of DUNGEON_STYLES) {
      const style = dungeonStyle(look);
      const drawn = drawWindow(fieldModel(true), style, DEFAULT_VIEW, PX, WINDOW);
      expect(drawn.texts).toEqual([]);
      await savePng(drawn.canvas, `rubble-field/cave-${look}`);
      const empty = fieldModel(true);
      empty.floors[0]!.terrain = [];
      const paths = pathCount(renderMapSvg(fieldModel(true), style, DEFAULT_VIEW, { pxPerCell: 30 }).svg) - pathCount(renderMapSvg(empty, style, DEFAULT_VIEW, { pxPerCell: 30 }).svg);
      expect(paths, `${look} SVG`).toBeGreaterThan(0);
    }
  });

  it(`adds at most ${FIELD_BUDGET_MS} ms per painter to a ${FIELD_CELLS}-cell field for its ragged patch`, async () => {
    expect(fieldCells(FIELD_CELLS)).toHaveLength(FIELD_CELLS);
    const rows = ['painter\twhole field, built floor\twhole field, cave floor\tpatch traced\ttint over cells\ttint over patch\tpatch adds (ms)'];
    const over: string[] = [];
    for (const [painter, look] of Object.entries(PAINTERS)) {
      const built = costOf(fieldModel(false), look, drawTerrainGround);
      const cave = costOf(fieldModel(true), look, drawTerrainGround);
      const traced = costOf(fieldModel(true), look, ragged);
      const cellTint = costOf(fieldModel(true), look, toneOver((hand) => cellGround(fieldPiece(hand))));
      const patchTint = costOf(fieldModel(true), look, toneOver(ragged));
      // The patch costs its tracing and whatever its tint costs over the cells' (which takes the tracing again).
      const adds = Math.max(traced, patchTint - cellTint);
      rows.push([painter, built, cave, traced, cellTint, patchTint, adds].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join('\t'));
      if (adds > FIELD_BUDGET_MS) over.push(`${painter}: ${adds.toFixed(2)} ms`);
    }
    await commands.writeFile('out/perf-glyph/rubbleField.txt', `${rows.join('\n')}\n`);
    expect(over).toEqual([]);
  });
});
