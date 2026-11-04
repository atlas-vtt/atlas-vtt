import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import type { CellPoint, DungeonModel } from '../../src/app/dungeons/model';
import { buildArtScene } from '../../src/app/dungeons/render/art/artScene';
import type { Hand } from '../../src/app/dungeons/render/art/hand';
import { crayonBox } from '../../src/app/dungeons/render/crayon/crayonBox';
import { crayonHand } from '../../src/app/dungeons/render/crayon/hand';
import { crayonPens } from '../../src/app/dungeons/render/crayon/pens';
import { engravedHand } from '../../src/app/dungeons/render/engraved/hand';
import { pensOf } from '../../src/app/dungeons/render/engraved/pens';
import { createRenderEnv } from '../../src/app/dungeons/render/renderEnv';
import { stoneColours } from '../../src/app/dungeons/render/stone/colours';
import { stoneHand } from '../../src/app/dungeons/render/stone/hand';
import { drawTerrainOpenings } from '../../src/app/dungeons/render/terrain/drawTerrain';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW, type ArtDirection } from '../../src/app/dungeons/style';
import { DUNGEON_STYLES, dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { draft } from '../../src/app/dungeons/terrain/catalog';
import { addRoom, emptyModel } from '../fixtures/dungeonModelBuilder';
import { savePng } from './dungeonRenderHarness';
import { drawWindow, inkMask, type Drawn } from './glyphSheetChecks';

/**
 * A bottomless chasm or shaft on a cave's floor is a crack in the rock: its outline traced through
 * its cells and rounded, so no edge runs straight along a cell line for long, and never more than
 * `REACH` cells past its cells, since the scene's walls are cut from the cells. A built floor's
 * holes are held to the picture they had before: `VITE_CHASM_REFERENCE=write` writes that picture
 * of every look to `out/chasm-reference/`, and every later run compares with it, pixel for pixel.
 * Pictures go to `out/dungeon-render/chasm/`; what a 20-cell chasm costs per painter, on either floor, to
 * `out/perf-glyph/caveChasm.txt`.
 */

const PX = 100;
const REFERENCE = 'out/chasm-reference';
const WINDOW = { x: -1, y: -1, cells: 16, rows: 12 };
/** How far past its cells a hole's drawing may reach, in cells. */
const REACH = 0.3;
/** The longest run of a hole's edge along one cell line, in cells. */
const STRAIGHT = 2;
/** What a 20-cell chasm's crack may add per painter to its drawing on a built floor, in milliseconds. */
const BUDGET_MS = 3;

/** A chasm of twelve cells stepping across the room, with straight runs of three and four cells along cell lines. */
const CHASM: CellPoint[] = [
  ...[3, 4, 5].map((x) => ({ x, y: 4 })),
  ...[3, 4, 5, 6, 7].map((x) => ({ x, y: 5 })),
  ...[6, 7, 8, 9].map((x) => ({ x, y: 6 })),
];
const SHAFT: CellPoint[] = [{ x: 11, y: 2 }];
/** A chasm of twenty cells, for its cost. */
const WIDE_CHASM: CellPoint[] = [...CHASM, ...[2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ x, y: 7 }))];

function holeModel(cave: boolean, chasm = CHASM, holes = true): DungeonModel {
  const model = emptyModel(71);
  const floor = model.floors[0]!;
  if (cave) {
    model.theme = 'cavern';
    floor.cave = { lane: [], heights: [0], faults: [], basins: [], streams: [], dams: [] };
  }
  addRoom(floor, { x: 0, y: 0, w: 15, h: 11 });
  if (holes) {
    floor.terrain.push({ id: 0, ...draft('chasm', 0, chasm), opening: { bottom: null, link: 0 } });
    floor.terrain.push({ id: 1, ...draft('shaft', 0, SHAFT), opening: { bottom: null, link: 1 } });
  }
  return model;
}

async function pngOf(canvas: OffscreenCanvas): Promise<string> {
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Pixels of a canvas that differ from a PNG, read back through the browser's decoder. */
async function differingPixels(canvas: OffscreenCanvas, png: string): Promise<number> {
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
  if (bitmap.width !== canvas.width || bitmap.height !== canvas.height) return Infinity;
  const decoded = new OffscreenCanvas(bitmap.width, bitmap.height);
  decoded.getContext('2d')!.drawImage(bitmap, 0, 0);
  const x = decoded.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height).data;
  // Through a PNG, so the canvas is compared as it is written.
  const roundTrip = await createImageBitmap(await canvas.convertToBlob({ type: 'image/png' }));
  const again = new OffscreenCanvas(bitmap.width, bitmap.height);
  again.getContext('2d')!.drawImage(roundTrip, 0, 0);
  const y = again.getContext('2d')!.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let differ = 0;
  for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2] || x[i + 3] !== y[i + 3]) differ++;
  return differ;
}

/** How far a point lies outside the cells, in cells; 0 inside. */
function outside(cells: readonly CellPoint[], x: number, y: number): number {
  let best = Infinity;
  for (const c of cells) {
    const dx = Math.max(c.x - x, 0, x - c.x - 1);
    const dy = Math.max(c.y - y, 0, y - c.y - 1);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

/** The mask with every pocket the outside cannot reach filled: the drawing's whole area, its inner hatching no edge. */
function filled(mask: Uint8Array, w: number, h: number): Uint8Array {
  const reached = new Uint8Array(w * h);
  const stack: number[] = [];
  const visit = (i: number): void => {
    if (mask[i] === 0 && reached[i] === 0) {
      reached[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < w * (h - 1)) visit(i + w);
  }
  return reached.map((r) => 1 - r);
}

/** The cell a pixel's middle lies in, as world coordinates. */
const worldOf = (drawn: Drawn, i: number): { x: number; y: number } => ({
  x: drawn.origin.x + ((i % drawn.canvas.width) + 0.5) / drawn.px,
  y: drawn.origin.y + (Math.floor(i / drawn.canvas.width) + 0.5) / drawn.px,
});

/** How far either way of one cell line an edge may wobble and still run along it, in cells: a chiselled lip's wobble. */
const BAND = 0.06;

/**
 * The longest stretch, in cells, over which the drawing's edges facing up or down stay within
 * `BAND` of one pixel row, or those facing left or right of one column: a staircase of cells keeps
 * whole cell sides straight however its lip is chiselled.
 */
function longestStraightEdge(mask: Uint8Array, w: number, h: number, px: number): { cells: number; at: string } {
  const on = (x: number, y: number): number => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]!);
  const band = Math.round(BAND * px);
  let longest = 0;
  let at = '';
  for (const across of [false, true]) {
    const [lines, along] = across ? [w, h] : [h, w];
    const edge = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (on(x, y) === 1 && (across ? on(x - 1, y) === 0 || on(x + 1, y) === 0 : on(x, y - 1) === 0 || on(x, y + 1) === 0)) edge[y * w + x] = 1;
      }
    }
    for (let line = 0; line < lines; line++) {
      let run = 0;
      for (let k = 0; k < along; k++) {
        let near = false;
        for (let o = Math.max(0, line - band); o <= Math.min(lines - 1, line + band) && !near; o++) near = edge[across ? k * w + o : o * w + k] === 1;
        run = near ? run + 1 : 0;
        if (run > longest) [longest, at] = [run, across ? `column ${line} to row ${k}` : `row ${line} to column ${k}`];
      }
    }
  }
  return { cells: longest / px, at };
}

const PAINTERS: Record<ArtDirection, string> = { stone: 'parchment', engraved: 'print', crayon: 'crayon' };

/** A painter's hand over a canvas of the room at `PX`. */
function handOf(model: DungeonModel, look: string): { hand: Hand; canvas: OffscreenCanvas } {
  const canvas = new OffscreenCanvas(15 * PX, 11 * PX);
  const ctx = canvas.getContext('2d')!;
  const style = dungeonStyle(look);
  const env = createRenderEnv(ctx, visibleDungeon(model, DEFAULT_VIEW), style, DEFAULT_VIEW, PX);
  ctx.scale(PX, PX);
  const scene = buildArtScene(env, { originCell: { x: 0, y: 0 }, widthPx: canvas.width, heightPx: canvas.height, pxPerCell: PX }, [], false);
  if (style.direction === 'stone') return { hand: stoneHand(scene, stoneColours(env.palette, false)), canvas };
  const pens = style.direction === 'crayon' ? crayonPens(scene) : pensOf(scene);
  return { hand: style.direction === 'crayon' ? crayonHand(scene, pens, crayonBox(scene)) : engravedHand(scene, pens), canvas };
}

/** Milliseconds the holes take on a painter's hand: the middle of five runs of ten, a pixel read to wait for the canvas. */
function costOf(model: DungeonModel, look: string): number {
  const { hand, canvas } = handOf(model, look);
  const read = canvas.getContext('2d')!;
  const runs: number[] = [];
  for (let run = 0; run < 5; run++) {
    const started = performance.now();
    for (let i = 0; i < 10; i++) drawTerrainOpenings(hand);
    read.getImageData(0, 0, 1, 1);
    runs.push((performance.now() - started) / 10);
  }
  return runs.sort((a, b) => a - b)[2]!;
}

describe('chasms on a cave floor', () => {
  it('draws a built floor\'s holes as they were, in every look', async () => {
    const write = (import.meta.env as Record<string, string | undefined>).VITE_CHASM_REFERENCE === 'write';
    const changed: string[] = [];
    for (const { id: look } of DUNGEON_STYLES) {
      const drawn = drawWindow(holeModel(false), dungeonStyle(look), DEFAULT_VIEW, PX, WINDOW);
      await savePng(drawn.canvas, `chasm/built-${look}`);
      if (write) {
        await commands.writeFile(`${REFERENCE}/built-${look}.png`, await pngOf(drawn.canvas), 'base64');
        continue;
      }
      const differ = await differingPixels(drawn.canvas, await commands.readFile(`${REFERENCE}/built-${look}.png`, 'base64'));
      if (differ > 0) changed.push(`${look}: ${differ} pixels differ`);
    }
    expect(changed).toEqual([]);
  });

  it(`keeps a cave's chasm and shaft within ${REACH} cells of their cells, their edges off the cell lines`, async () => {
    const problems: string[] = [];
    for (const [painter, look] of Object.entries(PAINTERS)) {
      const style = dungeonStyle(look);
      const drawn = drawWindow(holeModel(true), style, DEFAULT_VIEW, PX, WINDOW);
      await savePng(drawn.canvas, `chasm/cave-${painter}`);
      const empty = drawWindow(holeModel(true, CHASM, false), style, DEFAULT_VIEW, PX, WINDOW);
      const { mask } = inkMask(drawn, empty);
      const cells = [...CHASM, ...SHAFT];
      let farthest = 0;
      mask.forEach((on, i) => {
        if (!on) return;
        const p = worldOf(drawn, i);
        farthest = Math.max(farthest, outside(cells, p.x, p.y));
      });
      const straight = longestStraightEdge(filled(mask, drawn.canvas.width, drawn.canvas.height), drawn.canvas.width, drawn.canvas.height, PX);
      if (farthest > REACH) problems.push(`${painter}: drawn ${farthest.toFixed(2)} cells past its cells`);
      if (straight.cells > STRAIGHT) problems.push(`${painter}: an edge runs ${straight.cells.toFixed(2)} cells along a cell line, at pixel ${straight.at}`);
    }
    expect(problems).toEqual([]);
  });

  it(`adds at most ${BUDGET_MS} ms per painter to a 20-cell chasm for its crack`, async () => {
    expect(WIDE_CHASM).toHaveLength(20);
    const rows = ['painter\tbuilt floor (ms)\tcave floor (ms)\tcrack adds (ms)'];
    const over: string[] = [];
    for (const [painter, look] of Object.entries(PAINTERS)) {
      const built = costOf(holeModel(false, WIDE_CHASM), look);
      const cave = costOf(holeModel(true, WIDE_CHASM), look);
      rows.push([painter, built, cave, cave - built].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join('\t'));
      if (cave - built > BUDGET_MS) over.push(`${painter}: ${(cave - built).toFixed(2)} ms`);
    }
    await commands.writeFile('out/perf-glyph/caveChasm.txt', `${rows.join('\n')}\n`);
    expect(over).toEqual([]);
  });
});
