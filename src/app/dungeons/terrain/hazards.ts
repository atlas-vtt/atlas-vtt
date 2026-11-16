/**
 * Hazards a party sees at a glance and positions around (Terrain principle 3): chasms, channels of
 * lava, acid or water, deep water and pits. A hazard never cuts a room in two: a band from wall to
 * wall has a bridge across it (one cell wide, Terrain principle 4), and one the way can lead round
 * (it stops short of a wall, or lies in the room's middle) has none, since nobody needs it. A chasm on a floor with floors
 * below opens onto them (`holes.ts`).
 */

import { floorBelow } from '../floors/floorStack';
import type { CellPoint } from '../model';
import { type CellRect, cellsOf, floorRect, intersection } from '../geometry';
import { type Rng, chance, int, pick, shuffled, weighted } from '../rng';
import type { DungeonTag } from '../tags';
import { draft } from './catalog';
import { cutHole, dropBelow } from './holes';
import type { RoomCells } from './roomCells';
import { type Band, bandAcross, jaggedBlock } from './shapes';
import type { TerrainWork } from './work';

export type HazardChoice = 'chasm' | 'channel' | 'deep-water' | 'pit';

/** How likely each hazard is, by the dungeon's tags. */
export function hazardWeights(tags: ReadonlySet<DungeonTag>): (readonly [HazardChoice, number])[] {
  const wet = tags.has('wet') || tags.has('flooded');
  const molten = tags.has('lava') || tags.has('acid');
  return [
    ['chasm', tags.has('crumbling') || tags.has('deep') ? 5 : 3],
    ['channel', molten ? 4 : substances(tags).length ? 1.5 : 0],
    ['deep-water', tags.has('dry') ? 0 : wet ? 3 : 0.7],
    ['pit', 1.5],
  ];
}

export type Substance = { hazard: 'lava' | 'acid' | 'deep-water'; name: string };

/**
 * What may run in a channel, by the tags: lava and acid only where asked for, water wherever the
 * dungeon is not dry. Without any, a dungeon has no channels.
 */
function substances(tags: ReadonlySet<DungeonTag>): (readonly [Substance, number])[] {
  return [
    [{ hazard: 'lava', name: 'dungeon.terrain.lavaChannel' }, tags.has('lava') ? 3 : 0] as const,
    [{ hazard: 'acid', name: 'dungeon.terrain.acidChannel' }, tags.has('acid') ? 2 : 0] as const,
    [{ hazard: 'deep-water', name: 'dungeon.terrain.waterChannel' }, tags.has('dry') ? 0 : tags.has('wet') || tags.has('flooded') ? 2 : 1] as const,
  ].filter(([, weight]) => weight > 0);
}

/** What runs in this channel; null where the tags leave nothing to run. */
function substance(rng: Rng, tags: ReadonlySet<DungeonTag>): Substance | null {
  const choices = substances(tags);
  return choices.length ? weighted<Substance>(rng, choices) : null;
}

/** Bands across the room to try, each with its bridge where the way through the room's middle crosses it. */
function bands(rc: RoomCells, rng: Rng, thickness: number, jagged: boolean): Band[] {
  if (rc.depth < 5 || rc.width < 3) return [];
  const rows = shuffled(rng, Array.from({ length: rc.depth - 4 }, (_, k) => k + 2)).filter((i0) => i0 + thickness <= rc.depth - 2);
  const middle = (rc.width - 1) / 2;
  const columns = [Math.floor(middle), Math.ceil(middle), Math.floor(middle) - 1, Math.ceil(middle) + 1].filter((j, k, all) => j >= 0 && j < rc.width && all.indexOf(j) === k);
  const gapAt = rc.width >= 5 && chance(rng, 0.6) ? pick<0 | 1>(rng, [0, 1]) : -1;
  return rows.flatMap((i0) => columns.map((bridgeJ) => bandAcross(rc, rng, i0, thickness, { jagged, gapAt, bridgeJ })));
}

/** The cells at both ends of a bridge, which stay clear so it always leads somewhere. */
function landings(rc: RoomCells, band: Band): CellPoint[] {
  const step = rc.axis;
  const first = band.bridge[0];
  const last = band.bridge[band.bridge.length - 1];
  if (!first || !last) return [];
  const along = band.bridge.length > 1 ? { x: Math.sign(last.x - first.x), y: Math.sign(last.y - first.y) } : step;
  return [
    { x: first.x - along.x, y: first.y - along.y },
    { x: last.x + along.x, y: last.y + along.y },
  ];
}

/** A hazard takes at most this share of a room's floor... */
const HAZARD_SHARE = 0.4;
/** ...and leaves this many free cells, for the room's own cover. */
const LEFT_FREE = 4;

/** Whether a hazard on `cells` (crossed by `bridge`) leaves the room enough of itself, room for cover among it. */
/** Whether a hazard on `cells` leaves its room enough: off its stairs, at most its share of the floor, free cells and a place for cover. */
export function leavesRoom(rc: RoomCells, cells: readonly CellPoint[], bridge: readonly CellPoint[] = []): boolean {
  return !cells.some((c) => rc.nearStairs(c)) && cells.length <= rc.floorCount * HAZARD_SHARE && rc.freeCount() - cells.length >= LEFT_FREE && rc.keepsCover(cells, bridge);
}

/** Whether both ends of the band's bridge land on floor nothing blocks, outside the band. */
function landsOnFloor(rc: RoomCells, band: Band): boolean {
  if (band.bridge.length === 0) return true;
  const own = new Set(band.cells.map((c) => `${c.x},${c.y}`));
  return landings(rc, band).every((c) => rc.isFloor(c) && !rc.isBlocked(c) && !rc.nearStairs(c) && !own.has(`${c.x},${c.y}`));
}

/**
 * The band with its bridge only where the way cannot lead round it: where the bridge's two ends
 * are joined by floor without it, the bridge goes, and a band that would then cut a corner of the
 * room off is refused by the room's own checks.
 */
function neededBridge(rc: RoomCells, band: Band): Band {
  const [from, to] = landings(rc, band);
  if (!from || !to) return band;
  const own = new Set(band.cells.map((c) => `${c.x},${c.y}`));
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length) {
    const c = queue.pop() as CellPoint;
    if (c.x === to.x && c.y === to.y) return { cells: band.cells, bridge: [] };
    for (const n of [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }]) {
      const k = `${n.x},${n.y}`;
      if (seen.has(k) || own.has(k) || !rc.isFloor(n) || rc.isBlocked(n)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return band;
}

function bridgeOver(work: TerrainWork, k: number, rc: RoomCells, band: Band, spans: number, name: string): void {
  const floor = work.floors[k];
  if (!floor || band.bridge.length === 0) return;
  floor.addBridge(draft('bridge', rc.room.id, band.bridge, { facing: rc.axis, name }), spans);
  rc.keepClear(landings(rc, band));
}

/** Blobs inside the room, a cell clear of its walls, from large to small, up to `each` places of each size. */
function blobs(rc: RoomCells, rng: Rng, sizes: readonly (readonly [number, number])[], each = 6, irregular = false): CellPoint[][] {
  return sizes.flatMap(([di, dj]) => {
    if (rc.depth < di + 2 || rc.width < dj + 2) return [];
    const spots = Array.from({ length: (rc.depth - di - 1) * (rc.width - dj - 1) }, (_, k) => [1 + (k % (rc.depth - di - 1)), 1 + Math.floor(k / (rc.depth - di - 1))] as const);
    return shuffled(rng, spots).slice(0, each).map(([i, j]) => jaggedBlock(rc, rng, i, j, di, dj, irregular));
  });
}

/** A blob's bridge: straight along the room's axis through its middle column, where the blob is three cells deep there. */
function blobBridge(rc: RoomCells, cells: readonly CellPoint[]): Band {
  const own = new Set(cells.map((c) => `${c.x},${c.y}`));
  for (let j = 0; j < rc.width; j++) {
    const column = Array.from({ length: rc.depth }, (_, i) => rc.cell(i, j)).filter((c) => own.has(`${c.x},${c.y}`));
    if (column.length < 3) continue;
    const middle = cells.reduce((sum, c) => sum + (c.x * rc.across.x + c.y * rc.across.y), 0) / cells.length;
    const at = column[0]!.x * rc.across.x + column[0]!.y * rc.across.y;
    if (Math.abs(at - middle) <= 0.5) return { cells: [...cells], bridge: column };
  }
  return { cells: [...cells], bridge: [] };
}

/** Whether cells may open onto the floor below: every one over the floor of one regular room there. */
export function overRoomBelow(work: TerrainWork, k: number, cells: readonly CellPoint[]): boolean {
  const below = work.floors[floorBelow(work.stack, k) ?? -1];
  return !below || below.roomHolding(cells)?.room.wing === 'regular';
}

/** Whether cells fill their bounding rectangle: a plain rectangle no natural hole is. */
function plainRectangle(cells: readonly CellPoint[]): boolean {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  return (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) === cells.length;
}

/** A chasm across the room or a blob in it; `natural`, as a collapse in a built theme: never a plain rectangle. */
function placeChasm(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, natural = false): boolean {
  const thickness = rc.depth >= 8 && chance(rng, 0.5) ? 2 : 1;
  const tryBand = (drawn: Band): boolean => {
    if (natural && plainRectangle(drawn.cells)) return false;
    const band = neededBridge(rc, drawn);
    if (!leavesRoom(rc, band.cells, band.bridge) || !overRoomBelow(work, k, band.cells) || !landsOnFloor(rc, band) || !rc.allows(band.cells, 'block', band.bridge)) return false;
    const drop = dropBelow(work, k, band.cells, rng);
    // A collapse's floor lies below it: never an abyss to nowhere.
    if (natural && drop?.bottom === null) return false;
    const id = drop && cutHole(work, k, rc, 'chasm', band.cells, drop, { bridge: band.bridge });
    if (id === null || id === undefined) return false;
    if (band.bridge.length > 0) bridgeOver(work, k, rc, band, id, 'dungeon.terrain.ropeBridge');
    return true;
  };
  const rifts = bands(rc, rng, thickness, true).slice(0, 12);
  const sizes: readonly (readonly [number, number])[] = natural ? [[3, 3], [4, 3], [3, 4], [4, 4]] : [[3, 3], [4, 3], [3, 4], [2, 3], [3, 2], [2, 2]];
  const holes = blobs(rc, rng, sizes, 12, natural).map((cells) => blobBridge(rc, cells));
  const order = chance(rng, 0.5) ? [...rifts, ...holes] : [...holes, ...rifts];
  return order.some(tryBand);
}

/** Rectangles of the room's floor that lie over the floor of a regular room on the floor below, at least 2 × 2. */
function overlapsBelow(work: TerrainWork, k: number, rc: RoomCells): CellRect[] {
  const below = work.floors[floorBelow(work.stack, k) ?? -1];
  if (!below) return [];
  return below.plan.rooms.flatMap((room) => {
    if (room.kind !== 'room' || room.wing !== 'regular') return [];
    const o = intersection(floorRect(rc.room), floorRect(room));
    return o && o.x1 > o.x0 && o.y1 > o.y0 ? [o] : [];
  });
}

/**
 * A chasm that opens onto the floor below: a hole over a stretch of this room that lies over a
 * room there, bridged where it is three cells across. False where the room lies over none.
 */
export function placeChasmOver(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const shapes = overlapsBelow(work, k, rc).flatMap((o) =>
    ([[3, 3], [2, 3], [3, 2], [2, 2]] as const).flatMap(([w, h]) => {
      const out: CellPoint[][] = [];
      for (let y = o.y0; y + h - 1 <= o.y1; y++) for (let x = o.x0; x + w - 1 <= o.x1; x++) out.push(cellsOf({ x0: x, y0: y, x1: x + w - 1, y1: y + h - 1 }));
      return shuffled(rng, out).slice(0, 4);
    }),
  );
  return shapes.some((cells) => {
    const band = neededBridge(rc, blobBridge(rc, cells));
    if (!leavesRoom(rc, cells, band.bridge) || !landsOnFloor(rc, band) || !rc.allows(band.cells, 'block', band.bridge)) return false;
    const drop = dropBelow(work, k, band.cells, rng);
    const id = drop && cutHole(work, k, rc, 'chasm', band.cells, drop, { bridge: band.bridge });
    if (id === null || id === undefined) return false;
    if (band.bridge.length > 0) bridgeOver(work, k, rc, band, id, 'dungeon.terrain.ropeBridge');
    return true;
  });
}

function placeChannel(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const flowing = substance(rng, work.tags);
  if (!flowing) return false;
  const { hazard, name } = flowing;
  const floor = work.floors[k];
  for (const drawn of bands(rc, rng, 1, false).slice(0, 12)) {
    const band = neededBridge(rc, drawn);
    if (!leavesRoom(rc, band.cells, band.bridge) || !landsOnFloor(rc, band)) continue;
    const id = floor?.place(draft('channel', rc.room.id, band.cells, { name, traits: { hazard }, facing: rc.across }), band.bridge);
    if (id === null || id === undefined) continue;
    bridgeOver(work, k, rc, band, id, 'dungeon.terrain.stoneBridge');
    return true;
  }
  return false;
}

function placePool(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const floor = work.floors[k];
  return blobs(rc, rng, [[3, 3], [2, 3], [3, 2], [2, 2]]).some((cells) => leavesRoom(rc, cells) && floor?.place(draft('deep-water', rc.room.id, cells)) != null);
}

/** One pit, or two flanking the way through the room. */
function placePits(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  const floor = work.floors[k];
  if (!floor || rc.depth < 3 || rc.width < 3) return false;
  const size = rc.depth >= 6 && rc.width >= 6 && chance(rng, 0.4) ? 2 : 1;
  const i = int(rng, 1, Math.max(1, rc.depth - size - 1));
  if (size === 1 && rc.width >= 5 && chance(rng, 0.5)) {
    const pair = [rc.block(i, 1, 1, 1), rc.block(i, rc.width - 2, 1, 1)];
    if (pair.every((cells) => rc.allows(cells, 'block') && !cells.some((c) => rc.nearStairs(c)))) {
      pair.forEach((cells) => floor.place(draft('pit', rc.room.id, cells)));
      return true;
    }
  }
  return blobs(rc, rng, [[size, size]]).some((cells) => leavesRoom(rc, cells) && floor.place(draft('pit', rc.room.id, cells)) !== null);
}

/** A collapse in a built theme's room: an irregular chasm onto the floor below, never a plain rectangle. */
export function placeCollapse(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): boolean {
  return placeChasm(work, k, rc, rng, true);
}

/** One hazard of `choice` in the room, else of another kind that fits (one of `only` where given); false where none does. */
export function placeHazard(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, choice: HazardChoice, only?: readonly HazardChoice[]): boolean {
  const order: HazardChoice[] = [choice, ...(['chasm', 'channel', 'deep-water', 'pit'] as const).filter((c) => c !== choice)];
  const allowed = new Set(hazardWeights(work.tags).filter(([c, w]) => w > 0 && (only?.includes(c) ?? true)).map(([c]) => c));
  return order.filter((c) => allowed.has(c)).some((c) => {
    switch (c) {
      case 'chasm':
        return placeChasm(work, k, rc, rng);
      case 'channel':
        return placeChannel(work, k, rc, rng);
      case 'deep-water':
        return placePool(work, k, rc, rng);
      case 'pit':
        return placePits(work, k, rc, rng);
    }
  });
}
