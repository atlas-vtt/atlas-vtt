import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonRequest } from '../../src/app/dungeons/model';
import { wayExtent } from '../../src/app/dungeons/render/cave/mouth/wayOut';
import { pointInPolygon, type Vec } from '../../src/app/dungeons/render/geometry';
import { luminance, paletteOf, parseHex } from '../../src/app/dungeons/render/palette';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { visibleDungeon, type VisibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { ART_DUNGEONS } from './dungeonArtSheets';

/**
 * Rock a cave closes in on is rock through and through, in both painters (parchment is Stone &
 * shadow, print Engraved): the rock round a loop of passages, or a stretch of rock whose way out to
 * the open lies between walls closer than the hatched band is wide, shows the band's ink in its
 * middle, never bare paper. Such rock read as holes in the map (seed 606, `cavern-limestone`), and
 * caves whose outline lay far from its box's sides were not hatched at all (`bandSeeds`).
 */

const PX = 40;
/** Spacing of the probe the islands are found on, in cells. */
const STEP = 0.1;
/** How far inside the paper the band leaves a sample lies, in cells, so the band's own edge is not read. */
const INSET = 0.25;
/**
 * How much wider than twice the band a neck may be, in cells, for the rock behind it to count:
 * the drawing closes necks up to 0.1 wider (`NECK_SLACK`), so rock is asked for behind necks a
 * little narrower than that and paper only beyond necks a little wider, never on the line itself.
 */
const CLOSED_NECK = 0.05;
const OPEN_NECK = 0.15;
/** Half the side of the square each sample reads, in cells. */
const WINDOW = 0.35;
const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print'];
const REQUESTS: readonly DungeonRequest[] = [
  ...ART_DUNGEONS.filter((d) => d.request.theme === 'cavern').map((d) => d.request),
  ...Array.from({ length: 24 }, (_, k): DungeonRequest => ({ seed: 3000 + k * 53, theme: 'cavern', tags: [['winding'], [], ['wet'], ['spacious'], ['large'], ['inhabited']][k % 6]!, floors: 1 + (k % 2) })),
];

/** The probe's grid over the floors with two cells round them: each point's distance from the floors, the open ground before a mouth as far as can be. */
function probe(dungeon: VisibleDungeon): { x0: number; y0: number; w: number; h: number; distance: Float32Array } {
  const b = dungeon.bounds;
  const x0 = b.minX - 2;
  const y0 = b.minY - 2;
  const w = Math.ceil((b.maxX - b.minX + 4) / STEP);
  const h = Math.ceil((b.maxY - b.minY + 4) / STEP);
  const distance = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * STEP;
      const y = y0 + (j + 0.5) * STEP;
      // The open ground before a mouth is the paper's: it leads out.
      distance[j * w + i] = dungeon.open.some((ring) => pointInPolygon(ring, x, y)) ? Infinity : dungeon.field.distance(x, y);
    }
  }
  return { x0, y0, w, h, distance };
}

/** The probe's points the open paper round the map reaches without coming nearer the floors than `beyond`. */
function openPaper({ w, h, distance }: ReturnType<typeof probe>, beyond: number): Uint8Array {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let k = 0; k < w * h; k++) {
    const i = k % w;
    const j = (k - i) / w;
    if ((i === 0 || j === 0 || i === w - 1 || j === h - 1) && distance[k]! > beyond) {
      outside[k] = 1;
      stack.push(k);
    }
  }
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % w;
    for (const n of [k - w, k + w, i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1]) {
      if (n >= 0 && n < w * h && distance[n]! > beyond && !outside[n]) {
        outside[n] = 1;
        stack.push(n);
      }
    }
  }
  return outside;
}

/**
 * Points of rock beyond the band (`reach` from every floor) that the open paper round the map
 * cannot reach without crossing the band: what the floors and the band close in on; and, to hold
 * the reading of the picture to account, points of that open paper.
 */
function rockBeyondBand(dungeon: VisibleDungeon, grid: ReturnType<typeof probe>, reach: number): { enclosed: Vec[]; paper: Vec[] } {
  const { x0, y0, w, h, distance } = grid;
  const b = dungeon.bounds;
  const closed = openPaper(grid, reach + CLOSED_NECK);
  const open = openPaper(grid, reach + OPEN_NECK);
  // A way out's stipple and scree lie on the paper beside it.
  const ways = dungeon.ways.map((way) => wayExtent(way, way.length + 1));
  const byAWay = (p: Vec): boolean => ways.some((e) => p.x > e.minX - 1 && p.x < e.maxX + 1 && p.y > e.minY - 1 && p.y < e.maxY + 1);
  const enclosed: Vec[] = [];
  const paper: Vec[] = [];
  for (let j = 0; j < h; j += 3) {
    for (let i = 0; i < w; i += 3) {
      const k = j * w + i;
      const d = distance[k]!;
      if (d <= reach + INSET || d === Infinity) continue;
      const p = { x: x0 + (i + 0.5) * STEP, y: y0 + (j + 0.5) * STEP };
      if (!closed[k]) enclosed.push(p);
      // Within the picture drawn, away from its edge.
      else if (open[k] && d > reach + 1 && p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY && (i + j) % 9 === 0 && !byAWay(p)) paper.push(p);
    }
  }
  return { enclosed, paper };
}

/** Share of the pixels round `p` darker than `dark`: the band's ink, never the vellum's mottling. */
function inkAround(ctx: OffscreenCanvasRenderingContext2D, origin: Vec, p: Vec, dark: number): number {
  const size = Math.round(WINDOW * 2 * PX);
  const { data } = ctx.getImageData(Math.round((p.x - origin.x - WINDOW) * PX), Math.round((p.y - origin.y - WINDOW) * PX), size, size);
  let ink = 0;
  for (let k = 0; k < data.length; k += 4) if (luminance([data[k]!, data[k + 1]!, data[k + 2]!]) < dark) ink++;
  return ink / (data.length / 4);
}

/** Least share of ink a square of hatched rock shows. */
const HATCHED = 0.02;

let islands = 0;

describe('rock a cave closes in on', () => {
  for (const request of REQUESTS) {
    it(`is drawn as rock, never paper: seed ${request.seed} [${request.tags.join(',')}]`, () => {
      const model = generateDungeon(request);
      for (let floor = 0; floor < model.floors.length; floor++) {
        const dungeon = visibleDungeon(model, DEFAULT_VIEW, floor);
        const grid = probe(dungeon);
        for (const look of LOOKS) {
          const style = dungeonStyle(look);
          const { enclosed: samples, paper: open } = rockBeyondBand(dungeon, grid, style.surround.reach);
          if (!samples.length) continue;
          const b = dungeon.bounds;
          const origin = { x: Math.floor(b.minX - 1), y: Math.floor(b.minY - 1) };
          const widthPx = Math.ceil(b.maxX + 1 - origin.x) * PX;
          const heightPx = Math.ceil(b.maxY + 1 - origin.y) * PX;
          const ctx = new OffscreenCanvas(widthPx, heightPx).getContext('2d', { willReadFrequently: true })!;
          renderMap(ctx, model, style, DEFAULT_VIEW, { pxPerCell: PX, floor, window: { originCell: origin, widthPx, heightPx } });
          const dark = luminance(parseHex(paletteOf(style, DEFAULT_VIEW).paper)) - 50;
          const bare = samples.filter((p) => inkAround(ctx, origin, p, dark) < HATCHED);
          islands += samples.length;
          const inked = open.filter((p) => inkAround(ctx, origin, p, dark) >= HATCHED);
          expect(inked.length, `${look}, floor ${floor}: open paper read as rock`).toBe(0);
          expect(bare.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`), `${look}, floor ${floor}: enclosed rock drawn as bare paper`).toEqual([]);
        }
      }
    }, 120_000);
  }
  it('finds enclosed rock in the cases above', () => {
    expect(islands).toBeGreaterThan(50);
  });
});
