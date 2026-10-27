/**
 * Checks of a generated dungeon's terrain, written apart from the generator: each returns a list of
 * problems, empty when sound. Map-Fu's whole cells, nothing on doors, stairs or the cells they are
 * reached from, a way through every floor that steps into no hazard and bridges that span what they
 * cross. Holes through floors are `holeInvariants.ts`'.
 */

import { type FloorStack, stairEnd } from '../../../src/app/dungeons/floors/floorStack';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonProp, DungeonRoom, DungeonTerrain, TerrainKind } from '../../../src/app/dungeons/model';
import { doorCells, floorCellsOf, holdsCell } from '../../../src/app/dungeons/geometry';
import { PROP_SPECS, isCellPiece } from '../../../src/app/dungeons/props/catalogue';

const key = (c: CellPoint): string => `${c.x},${c.y}`;
const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** What a party cannot walk across: every hazard and hole, cover, and the standing points of interest. */
const BLOCKING: ReadonlySet<TerrainKind> = new Set<TerrainKind>([
  'low-wall',
  'rubble-heap',
  'pillar',
  'statue',
  'wall-fragment',
  'obelisk',
  'chasm',
  'shaft',
  'channel',
  'deep-water',
  'pit',
  'gallery',
  'pool',
  'portal-ring',
]);

export function isHazard(piece: DungeonTerrain): boolean {
  return piece.traits.hazard !== undefined;
}

export function stairCells(floor: DungeonFloor): CellPoint[] {
  return floor.stairs.flatMap((s) => {
    const out: CellPoint[] = [];
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) out.push({ x, y });
    return out;
  });
}

/**
 * Stairwells stand clear: no hazard (lava, acid, water, a chasm or pit) and no bridge lies on a
 * stairwell, the row it is reached from or any cell beside them, and no pool reaches them.
 */
export function stairClearanceProblems(floor: DungeonFloor, index: number, stack: FloorStack): string[] {
  const near = new Set<string>();
  for (const c of [...stairCells(floor), ...stairApproaches(floor, index, stack)]) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.add(key({ x: c.x + dx, y: c.y + dy }));
  const pieces = floor.terrain.filter((p) => (isHazard(p) || p.kind === 'bridge') && p.kind !== 'chasm-floor' && p.cells.some((c) => near.has(key(c)))).map((p) => `${p.kind} ${p.id} beside a stairwell`);
  const water = floor.waterCells.some((c) => near.has(key(c))) ? ['water beside a stairwell'] : [];
  return [...pieces, ...water];
}

/** The row each stair end on this floor is reached from: before its high end above, past its low end below. */
export function stairApproaches(floor: DungeonFloor, index: number, stack: FloorStack): CellPoint[] {
  return floor.stairs.flatMap((s) => {
    const upper = stairEnd(stack, index, s.to) === 'upper';
    const d = upper ? { x: -s.down.x, y: -s.down.y } : s.down;
    const own = new Set(stairCells({ ...floor, stairs: [s] }).map(key));
    return [...own].map((k) => k.split(',').map(Number) as [number, number]).map(([x, y]) => ({ x: x + d.x, y: y + d.y })).filter((c) => !own.has(key(c)));
  });
}

/** The cells either side of a doorway: beside a cell door's wall, or the two cells a door on an edge stands between. */
function doorApproaches(floor: DungeonFloor): CellPoint[] {
  const back = (d: DungeonFloor['doors'][number]): number => (d.edge ? 0 : 1);
  return floor.doors.flatMap((d) =>
    doorCells(d).flatMap((c) => [
      ...(d.from !== null ? [{ x: c.x - d.dir.x * back(d), y: c.y - d.dir.y * back(d) }] : []),
      ...(d.to !== null ? [{ x: c.x + d.dir.x, y: c.y + d.dir.y }] : []),
    ]),
  );
}

/** Whether the cell is the room's floor: its rectangle, or a cave room's own cells. */
export function inFloor(room: DungeonRoom, c: CellPoint): boolean {
  return holdsCell(room, c.x, c.y);
}

/** Whether the whole cell lies on the room's floor: inside the circle of a round room. */
function wholeOnFloor(room: DungeonRoom, c: CellPoint): boolean {
  if (!inFloor(room, c)) return false;
  if (!room.rotunda) return true;
  const r = Math.sqrt(room.w * room.w + 1) / 2 + 1e-9;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  return [0, 1].every((dx) => [0, 1].every((dy) => Math.hypot(c.x + dx - cx, c.y + dy - cy) <= r));
}

/** Pieces fill whole cells of their room, each cell once (a bridge lies on what it spans), ids are their places. */
export function cellProblems(floor: DungeonFloor): string[] {
  const out: string[] = [];
  const owner = new Map<string, DungeonTerrain>();
  floor.terrain.forEach((piece, index) => {
    const where = `${piece.kind} ${piece.id} in room ${piece.room}`;
    if (piece.id !== index) out.push(`${where}: id is not its place`);
    const room = floor.rooms[piece.room];
    if (!room || room.kind !== 'room') out.push(`${where}: not in a normal room`);
    if (piece.cells.length === 0) out.push(`${where}: no cells`);
    for (const c of piece.cells) {
      if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) out.push(`${where}: a cell that is no whole cell`);
      if (room && !wholeOnFloor(room, c)) out.push(`${where}: cell ${key(c)} off the room's floor`);
      if (piece.kind === 'bridge') continue;
      const other = owner.get(key(c));
      if (other) out.push(`${where}: cell ${key(c)} also holds ${other.kind} ${other.id}`);
      owner.set(key(c), piece);
    }
  });
  return out;
}

/** No piece on a door cell, before a door, on a stairwell or the row it is reached from. */
export function clearanceProblems(floor: DungeonFloor, index: number, stack: FloorStack): string[] {
  const keep = new Set([...floor.doors.map(key), ...doorApproaches(floor), ...stairCells(floor), ...stairApproaches(floor, index, stack)].map(key));
  return floor.terrain.flatMap((piece) => piece.cells.filter((c) => keep.has(key(c))).map((c) => `${piece.kind} ${piece.id} on ${key(c)}, which stays clear`));
}

/** The cells a piece on whole cells stands on: those whose middles lie inside its box. */
export function propCells(floor: DungeonFloor, prop: DungeonProp): CellPoint[] {
  const spec = PROP_SPECS[prop.kind];
  if (!isCellPiece(spec) || spec.wallPiece) return [];
  const room = floor.rooms[prop.room];
  if (!room) return [];
  const along = prop.size?.along ?? spec.footprint.along;
  const { out } = spec.footprint;
  const front = { x: Math.sin(prop.rotation), y: -Math.cos(prop.rotation) };
  const cells: CellPoint[] = [];
  for (const { x, y } of floorCellsOf(room)) {
    const dx = x + 0.5 - prop.x;
    const dy = y + 0.5 - prop.y;
    if (Math.abs(dx * front.y - dy * front.x) < along / 2 && Math.abs(dx * front.x + dy * front.y) < out / 2) cells.push({ x, y });
  }
  return cells;
}

/** The cells pieces block: those of every cell piece that cannot be walked. */
export function blockingPropCells(floor: DungeonFloor): CellPoint[] {
  return floor.props.filter((p) => PROP_SPECS[p.kind].footing === 'block').flatMap((p) => propCells(floor, p));
}

/** The cells a party can stand on: room floors and door cells, less what blocks, bridges walkable again. */
export function walkable(floor: DungeonFloor): Set<string> {
  const cells = new Set<string>();
  for (const room of floor.rooms) {
    for (const c of floorCellsOf(room)) {
      const centreIn = !room.rotunda || Math.hypot(c.x + 0.5 - (room.x + room.w / 2), c.y + 0.5 - (room.y + room.h / 2)) <= Math.sqrt(room.w * room.w + 1) / 2;
      if (centreIn) cells.add(key(c));
    }
  }
  for (const door of floor.doors) for (const c of doorCells(door)) cells.add(key(c));
  for (const piece of floor.terrain) if (BLOCKING.has(piece.kind)) for (const c of piece.cells) cells.delete(key(c));
  for (const piece of floor.terrain) if (piece.kind === 'bridge') for (const c of piece.cells) cells.add(key(c));
  for (const c of blockingPropCells(floor)) cells.delete(key(c));
  return cells;
}

/**
 * From where the floor is entered (the first entrance, or room 0 on a floor below), every room,
 * every door's approach and every stairwell's is reached without stepping into a hazard, cover or a hole.
 */
export function routeProblems(floor: DungeonFloor): string[] {
  const open = walkable(floor);
  const room0 = floor.rooms[0];
  const start = floor.doors.find((d) => d.from === null) ?? (room0 && [...open].map((k) => k.split(',').map(Number) as [number, number]).map(([x, y]) => ({ x, y })).find((c) => inFloor(room0, c)));
  if (!start) return ['nowhere to start'];
  const seen = new Set([key(start)]);
  const queue: CellPoint[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as CellPoint;
    for (const d of STEPS) {
      const next = { x: at.x + d.x, y: at.y + d.y };
      if (!open.has(key(next)) || seen.has(key(next))) continue;
      seen.add(key(next));
      queue.push(next);
    }
  }
  const out: string[] = [];
  for (const c of doorApproaches(floor)) if (!seen.has(key(c))) out.push(`the cell before a door at ${key(c)} cannot be reached`);
  for (const room of floor.rooms) {
    const any = [...seen].some((k) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return inFloor(room, { x, y });
    });
    if (!any) out.push(`room ${room.id} cannot be reached`);
  }
  return out;
}

/** Every bridge spans a chasm or channel: on its cells, straight, one cell wide, landing on open floor of the room at both ends. */
export function bridgeProblems(floor: DungeonFloor): string[] {
  const open = walkable(floor);
  return floor.terrain.filter((p) => p.kind === 'bridge').flatMap((bridge) => {
    const where = `bridge ${bridge.id}`;
    const under = floor.terrain[bridge.spans ?? -1];
    if (!under || !['chasm', 'channel'].includes(under.kind)) return [`${where} spans no chasm or channel`];
    const own = new Set(under.cells.map(key));
    if (!bridge.cells.every((c) => own.has(key(c)))) return [`${where} leaves what it spans`];
    const xs = new Set(bridge.cells.map((c) => c.x));
    const ys = new Set(bridge.cells.map((c) => c.y));
    if (xs.size !== 1 && ys.size !== 1) return [`${where} is not one cell wide`];
    if (!bridge.facing || (bridge.facing.x !== 0) === (bridge.facing.y !== 0)) return [`${where} runs no way across`];
    const along = { x: Math.abs(bridge.facing.x), y: Math.abs(bridge.facing.y) };
    if ((along.x === 1 && ys.size !== 1) || (along.y === 1 && xs.size !== 1)) return [`${where} runs across its own way`];
    const sorted = [...bridge.cells].sort((a, b) => a.x * along.x + a.y * along.y - (b.x * along.x + b.y * along.y));
    if (sorted.some((c, i) => i > 0 && c.x * along.x + c.y * along.y - (sorted[i - 1]!.x * along.x + sorted[i - 1]!.y * along.y) !== 1)) return [`${where} has a gap`];
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const room = floor.rooms[bridge.room]!;
    const ends = [
      { x: first.x - along.x, y: first.y - along.y },
      { x: last.x + along.x, y: last.y + along.y },
    ];
    const landing = ends.filter((c) => !inFloor(room, c) || !open.has(key(c)) || own.has(key(c))).map((c) => `${where} lands at ${key(c)}, which is no open floor`);
    if (landing.length) return landing;
    // A bridge is laid only where the way cannot lead round what it spans.
    const bridged = new Set(bridge.cells.map(key));
    return linked(ends[0]!, ends[1]!, (c) => inFloor(room, c) && open.has(key(c)) && !bridged.has(key(c))) ? [`${where} crosses what the way leads round`] : [];
  });
}

/** Whether `to` can be reached from `from` in steps across cells `may` allows. */
function linked(from: CellPoint, to: CellPoint, may: (c: CellPoint) => boolean): boolean {
  const seen = new Set([key(from)]);
  const queue = [from];
  while (queue.length) {
    const c = queue.pop()!;
    if (c.x === to.x && c.y === to.y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!seen.has(key(n)) && may(n)) {
        seen.add(key(n));
        queue.push(n);
      }
    }
  }
  return false;
}

/** How many cells of the room a party cannot walk. */
export function blockedCells(floor: DungeonFloor, room: number): number {
  const bridged = new Set(floor.terrain.filter((p) => p.kind === 'bridge').flatMap((p) => p.cells.map(key)));
  const r = floor.rooms[room];
  const pieces = r ? blockingPropCells(floor).filter((c) => inFloor(r, c)).length : 0;
  return floor.terrain.filter((p) => p.room === room && BLOCKING.has(p.kind)).flatMap((p) => p.cells).filter((c) => !bridged.has(key(c))).length + pieces;
}

/** Whether the room holds cover: a piece of terrain or a prop that gives it, columns standing in it, or a gallery's parapet. */
export function hasCover(floor: DungeonFloor, room: number): boolean {
  const r = floor.rooms[room];
  const columns = r !== undefined && floor.columns.some((c) => c.x > r.x && c.x < r.x + r.w && c.y > r.y && c.y < r.y + r.h);
  const piece = floor.props.some((p) => p.room === room && PROP_SPECS[p.kind].cover !== undefined && !PROP_SPECS[p.kind].wallPiece);
  return columns || piece || floor.terrain.some((p) => p.room === room && (p.traits.cover !== undefined || p.kind === 'gallery'));
}
