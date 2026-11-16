import { describe, expect, it } from 'vitest';
import type { DungeonModel, TerrainDrop, VerticalKind } from '../../src/app/dungeons/model';
import type { CaveWayPart } from '../../src/app/dungeons/render/cave/caveArt';
import { CAVE_WAYS } from '../../src/app/dungeons/render/cave/ways';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { AVEN_CELL, WAY_SPOTS, caveVeinWaysModel } from './caveVeinWays';
import { savePng, withoutText } from './dungeonRenderHarness';

/**
 * The ways between caves as drawn, in each painter (parchment is Stone, print Engraved, crayon
 * Crayon): each way's marks lie within two cells of its door and an aven's of its cell; nothing
 * else on the map changes; a squeeze, a letterbox and a crawl keep the middle of their way clear of
 * ink; a door that names a walk draws as one without a way; and a climb within the floor stays
 * near its door cell, its rope on the higher side. A narrow way's walls close in on it
 * (`narrowPinch.ts`), and the rock's hatching follows the walls, so the marks are compared with the
 * same cave drawn without them (`withoutMarks`).
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

/** The parts that draw a door's way's marks. */
const MARK_PARTS: readonly CaveWayPart[] = ['lowWay', 'squeeze', 'letterbox', 'sumpWay', 'traverseWay', 'breakdownWay', 'climbWay'];

/** The cave with its ways, drawn without their marks and without the aven: what the marks are drawn over. */
function withoutMarks(look: DungeonStyleId): Picture {
  const kept = MARK_PARTS.map((part) => [part, CAVE_WAYS[part]] as const);
  for (const part of MARK_PARTS) CAVE_WAYS[part] = (): void => undefined;
  try {
    const model = caveVeinWaysModel();
    model.floors[0]!.terrain = model.floors[0]!.terrain.filter((piece) => piece.kind !== 'aven');
    return draw(model, look);
  } finally {
    for (const [part, painter] of kept) CAVE_WAYS[part] = painter;
  }
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
  for (const look of LOOKS) {
    it(`draws every way near its door and nothing elsewhere in ${look}`, () => {
      const drawn = draw(caveVeinWaysModel(), look);
      const plain = withoutMarks(look);
      const places = [
        ...WAY_SPOTS.filter(spot => spot.way !== 'walk').map(spot => ({ name: spot.way, cell: spot.door })),
        { name: 'aven', cell: AVEN_CELL },
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
      // A narrow way's marks are small, its narrowed walls saying the rest: a crawl one short pair of roof ticks on its door cell,
      // a sump only its roof coming down into the water, which is the floor's own.
      const least: Record<string, number> = { crawl: PX / 4, squeeze: PX, letterbox: PX, sump: PX };
      for (const [name, count] of counts) expect(count, `${look} ${name}: drawn`).toBeGreaterThan(least[name] ?? PX * 2);
    });

    it(`keeps the middle of a squeeze, a letterbox and a crawl clear in ${look}`, () => {
      const drawn = draw(caveVeinWaysModel(), look);
      const plain = withoutMarks(look);
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

  /** The cave without its ways, with one aven or bottomless hole of `kind` on `cell`. */
  function withVertical(piece: 'aven' | 'shaft', cell: { x: number; y: number }, drop: TerrainDrop): DungeonModel {
    const model = caveVeinWaysModel(false);
    const floor = model.floors[0]!;
    const opening = piece === 'shaft' ? { opening: { bottom: null, link: 40 } } : {};
    floor.terrain.push({ id: floor.terrain.length, room: 0, kind: piece, name: `dungeon.terrain.${piece}`, cells: [cell], traits: { drop }, ...opening });
    return model;
  }

  /** How many pixels of the picture `model` makes differ from the plain cave's, and the farthest of them from `cell`, in cells. */
  function inked(model: DungeonModel, plain: Picture, look: DungeonStyleId, cell: { x: number; y: number }): { count: number; reach: number } {
    const drawn = draw(model, look);
    let count = 0;
    let reach = 0;
    for (let y = 0; y < drawn.size; y++) for (let x = 0; x < drawn.size; x++) {
      if (!differs(drawn, plain, (y * drawn.size + x) * 4)) continue;
      count++;
      reach = Math.max(reach, beyond(cellAt(x, y), cell));
    }
    return { count, reach };
  }

  for (const look of LOOKS) {
    it(`opens a chimney narrower than a shaft and a vertical squeeze narrower still, overhead and underfoot, in ${look}`, () => {
      const plain = draw(caveVeinWaysModel(false), look);
      const hole = { x: 6, y: 8 };
      for (const [piece, cell] of [['aven', AVEN_CELL], ['shaft', hole]] as const) {
        const [shaft, chimney, squeeze] = (['shaft', 'chimney', 'squeeze'] as const).map(kind => inked(withVertical(piece, cell, { depth: 30, kind }), plain, look, cell));
        expect(chimney!.count, `${look} ${piece}: a chimney against a shaft`).toBeLessThan(shaft!.count * 0.85);
        expect(squeeze!.count, `${look} ${piece}: a squeeze against a chimney`).toBeLessThan(chimney!.count * 0.9);
        expect(squeeze!.count, `${look} ${piece}: a squeeze is drawn`).toBeGreaterThan(PX);
        for (const way of [shaft, chimney, squeeze]) expect(way!.reach, `${look} ${piece}: ink near its cell`).toBeLessThanOrEqual(REACH);
      }
    });
  }

  /** The cave without its ways, its walk turned into a climb of `kind` (a pitch's width or a chimney's), rising towards its passage unless it `descends`. */
  function withClimb(kind: VerticalKind, descends: boolean): DungeonModel {
    const model = caveVeinWaysModel(false);
    const spot = WAY_SPOTS.find(s => s.way === 'walk')!;
    const door = model.floors[0]!.doors.find(d => d.x === spot.door.x && d.y === spot.door.y)!;
    door.way = 'climb';
    door.width = kind === 'shaft' ? 8 : 3;
    door.drop = { depth: 20, kind };
    if (descends) door.descends = true;
    return model;
  }

  /** How far past its door cell a climb's ink may reach, in cells: its rubble spreads up to 0.8 cells past its band. */
  const CLIMB_REACH = 1.2;

  for (const look of LOOKS) {
    it(`draws a climb near its door cell, its rope on the upper side and a chimney with less than a pitch, in ${look}`, () => {
      const plain = draw(caveVeinWaysModel(false), look);
      const { door } = WAY_SPOTS.find(s => s.way === 'walk')!;
      const [pitch, chimney] = (['shaft', 'chimney'] as const).map(kind => inked(withClimb(kind, false), plain, look, door));
      expect(chimney!.count, `${look}: a chimney against a pitch`).toBeLessThan(pitch!.count);
      for (const way of [pitch, chimney]) {
        expect(way!.count, `${look}: a climb is drawn`).toBeGreaterThan(PX);
        expect(way!.reach, `${look}: ink beside its cell`).toBeLessThanOrEqual(CLIMB_REACH);
      }
      // The walk runs south from the chamber into its passage: the rope is tied on whichever side lies higher.
      // A pitch differs from a chimney by its rope and the ring it is tied to, so where the two differ is where the rope lies.
      for (const descends of [false, true]) {
        const roped = draw(withClimb('shaft', descends), look);
        const braced = draw(withClimb('chimney', descends), look);
        let north = 0;
        let south = 0;
        for (let y = 0; y < roped.size; y++) for (let x = 0; x < roped.size; x++) {
          if (!differs(roped, braced, (y * roped.size + x) * 4)) continue;
          const p = cellAt(x, y);
          if (p.y < door.y + 0.5) north++;
          else south++;
        }
        expect(descends ? north > south : south > north, `${look}: rope on the upper side (descends ${descends}: ${north} north, ${south} south)`).toBe(true);
      }
    });
  }

  it('writes a sample of every way in each painter', async () => {
    for (const look of LOOKS) await savePng(draw(caveVeinWaysModel(), look, 100).canvas, `caveWays/veins-${look}`);
    for (const look of LOOKS) await savePng(draw(withClimb('shaft', false), look, 100).canvas, `caveWays/climb-${look}`);
  });
});
