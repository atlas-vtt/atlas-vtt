import { describe, expect, it } from 'vitest';
import type { DungeonModel } from '../../src/app/dungeons/model';
import { continuingCell } from '../../src/app/dungeons/render/cave/ways/continuing';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { AVEN_CELL, CONTINUING, WAY_SPOTS, caveVeinWaysModel } from './caveVeinWays';
import { savePng, withoutText } from './dungeonRenderHarness';

/**
 * The ways between caves as drawn, in each painter (parchment is Stone, print Engraved, crayon
 * Crayon): each way's ink lies within two cells of its door, an aven's of its cell and a squeeze
 * leading on of its rim cell; nothing else on the map changes; a squeeze, a letterbox and a crawl
 * keep the middle of their way clear of ink; and a door that names a walk draws as one without a way.
 */

const PX = 60;
/** The window drawn, in cells: the chamber, its passages and the rock round them. */
const ORIGIN = { x: -1, y: -1 };
const CELLS = 19;
const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print', 'crayon'];
/** How far a way's drawing may reach from its cell, in cells. */
const REACH = 2;

interface Picture { data: Uint8ClampedArray; size: number; canvas: OffscreenCanvas }

function draw(model: DungeonModel, look: DungeonStyleId, px = PX): Picture {
  const size = CELLS * px;
  const canvas = new OffscreenCanvas(size, size);
  const { ctx, texts } = withoutText(canvas.getContext('2d')!);
  renderMap(ctx, model, dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: px, floor: 0, openings: 'drawn', window: { originCell: ORIGIN, widthPx: size, heightPx: size } });
  expect(texts).toEqual([]);
  return { data: canvas.getContext('2d')!.getImageData(0, 0, size, size).data, size, canvas };
}

const differs = (a: Picture, b: Picture, i: number): boolean =>
  Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!) > 12;

const luma = (p: Picture, i: number): number => 0.2126 * p.data[i]! + 0.7152 * p.data[i + 1]! + 0.0722 * p.data[i + 2]!;

/**
 * Whether pixel (x, y) lies within two pixels of an edge already drawn. The browser's rasteriser
 * may place a later stroke a pixel or two otherwise when what was drawn before it changes (it picks
 * how to draw a path by what it drew before), which moves pixels along that stroke's own edges,
 * never draws anything new on open floor or rock.
 */
function nearEdge(p: Picture, x: number, y: number): boolean {
  let lo = 255;
  let hi = 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= p.size || ny >= p.size) continue;
    const l = luma(p, (ny * p.size + nx) * 4);
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  }
  return hi - lo > 40;
}

/** The point in cells of pixel (x, y). */
const cellAt = (x: number, y: number): { x: number; y: number } => ({ x: ORIGIN.x + (x + 0.5) / PX, y: ORIGIN.y + (y + 0.5) / PX });

/** How far a point lies outside a cell's square, in cells. */
function beyond(p: { x: number; y: number }, cell: { x: number; y: number }): number {
  const dx = Math.max(cell.x - p.x, 0, p.x - cell.x - 1);
  const dy = Math.max(cell.y - p.y, 0, p.y - cell.y - 1);
  return Math.hypot(dx, dy);
}

/** The pixels of a strip down the middle of a door cell, `half` cells either side of the way's line, the cell's mouths left out. */
function middleStrip(spot: (typeof WAY_SPOTS)[number], half: number): number[] {
  const out: number[] = [];
  const { door, dir } = spot;
  for (let v = -0.4; v <= 0.4; v += 0.5 / PX) for (let u = -half; u <= half; u += 0.5 / PX) {
    const x = Math.floor((door.x + 0.5 - dir.y * u + dir.x * v - ORIGIN.x) * PX);
    const y = Math.floor((door.y + 0.5 + dir.x * u + dir.y * v - ORIGIN.y) * PX);
    out.push((y * CELLS * PX + x) * 4);
  }
  return out;
}

describe('the ways between caves as drawn', () => {
  it('finds the rim cell a squeeze leads on from', () => {
    const chamber = caveVeinWaysModel().floors[0]!.rooms[0]!;
    expect(continuingCell(chamber, CONTINUING.dir)).toEqual(CONTINUING.cell);
  });

  for (const look of LOOKS) {
    it(`draws every way near its door and nothing elsewhere in ${look}`, () => {
      const drawn = draw(caveVeinWaysModel(), look);
      const plain = draw(caveVeinWaysModel(false), look);
      const places = [
        ...WAY_SPOTS.filter(spot => spot.way !== 'walk').map(spot => ({ name: spot.way, cell: spot.door })),
        { name: 'aven', cell: AVEN_CELL },
        { name: 'continuing', cell: CONTINUING.cell },
      ];
      const counts = new Map<string, number>(places.map(place => [place.name, 0]));
      const strays: string[] = [];
      for (let y = 0; y < drawn.size; y++) for (let x = 0; x < drawn.size; x++) {
        const i = (y * drawn.size + x) * 4;
        if (!differs(drawn, plain, i)) continue;
        const p = cellAt(x, y);
        const near = places.filter(place => beyond(p, place.cell) <= REACH);
        for (const place of near) counts.set(place.name, counts.get(place.name)! + 1);
        if (!near.length && !nearEdge(plain, x, y)) strays.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      }
      expect(strays.slice(0, 8), `${look}: changed pixels beyond two cells of every way`).toEqual([]);
      for (const [name, count] of counts) expect(count, `${look} ${name}: drawn`).toBeGreaterThan(PX * 2);
    });

    it(`keeps the middle of a squeeze, a letterbox and a crawl clear in ${look}`, () => {
      const drawn = draw(caveVeinWaysModel(), look);
      const plain = draw(caveVeinWaysModel(false), look);
      for (const [way, half] of [['squeeze', 0.07], ['letterbox', 0.035], ['crawl', 0.12]] as const) {
        const spot = WAY_SPOTS.find(s => s.way === way)!;
        const changed = middleStrip(spot, half).filter(i => differs(drawn, plain, i)).length;
        expect(changed, `${look} ${way}: ink across the way`).toBe(0);
      }
    });

    it(`draws a door that names a walk as one without a way in ${look}`, () => {
      const plain = draw(caveVeinWaysModel(false), look);
      const model = caveVeinWaysModel(false);
      for (const door of model.floors[0]!.doors) door.way = 'walk';
      const walks = draw(model, look);
      let changed = 0;
      for (let i = 0; i < plain.data.length; i++) if (plain.data[i] !== walks.data[i]) changed++;
      expect(changed).toBe(0);
    });
  }

  it('writes a sample of every way in each painter', async () => {
    for (const look of LOOKS) await savePng(draw(caveVeinWaysModel(), look, 100).canvas, `caveWays/veins-${look}`);
  });
});
