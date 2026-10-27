import type { CellPoint, DungeonModel, GroundsPiece } from '../../../../src/app/dungeons/model';
import { cellKey as key, doorCells } from '../../../../src/app/dungeons/geometry';
import { SIDES, houseKeys } from './houseCells';

/** The grounds rules of a house (research §5.10, rules 7, 20 and 21), checked on a generated model alone. */

const cellKey = key;
const keysOf = (pieces: readonly GroundsPiece[]): Set<string> => new Set(pieces.flatMap((p) => p.cells.map((c) => cellKey(c.x, c.y))));
const of = (model: DungeonModel, ...kinds: GroundsPiece['kind'][]): GroundsPiece[] => (model.floors[0]!.grounds?.pieces ?? []).filter((p) => kinds.includes(p.kind));

/** How many cells of lot lie before, beside and behind the house. */
export function lotMargins(model: DungeonModel): { front: number; side: number; back: number } {
  const lot = model.floors[0]!.grounds!.lot;
  const cells = [...houseKeys(model.floors[0]!)].map((k) => k.split(',').map(Number) as [number, number]);
  const x0 = Math.min(...cells.map(([x]) => x));
  const x1 = Math.max(...cells.map(([x]) => x));
  const y0 = Math.min(...cells.map(([, y]) => y));
  const y1 = Math.max(...cells.map(([, y]) => y));
  return { front: lot.y + lot.h - 1 - y1, side: Math.max(x0 - lot.x, lot.x + lot.w - 1 - x1), back: y0 - lot.y };
}

/** The lot holds the house. */
function lotHoldsHouse(model: DungeonModel): string[] {
  const lot = model.floors[0]!.grounds!.lot;
  const out = [...houseKeys(model.floors[0]!)].filter((k) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return x < lot.x || y < lot.y || x >= lot.x + lot.w || y >= lot.y + lot.h;
  });
  return out.length ? [`${out.length} house cells off the lot`] : [];
}

/** 21. The boundary is closed but at its gates. */
function closedBoundary(model: DungeonModel): string[] {
  const lot = model.floors[0]!.grounds!.lot;
  const onEdge = (c: CellPoint): boolean => c.x === lot.x || c.y === lot.y || c.x === lot.x + lot.w - 1 || c.y === lot.y + lot.h - 1;
  const walls = of(model, 'boundary-wall', 'hedge').filter((p) => p.cells.some(onEdge));
  if (walls.length === 0) return [];
  const closed = keysOf([...walls, ...of(model, 'gate')]);
  const gaps: string[] = [];
  for (let x = lot.x; x < lot.x + lot.w; x++) for (const y of [lot.y, lot.y + lot.h - 1]) if (!closed.has(cellKey(x, y))) gaps.push(cellKey(x, y));
  for (let y = lot.y; y < lot.y + lot.h; y++) for (const x of [lot.x, lot.x + lot.w - 1]) if (!closed.has(cellKey(x, y))) gaps.push(cellKey(x, y));
  return gaps.length ? [`the boundary is open at ${gaps[0]}`] : [];
}

/** 7. The gate, the way in and the front door are one walk, two cells wide all the way. */
function wideWalkIn(model: DungeonModel): string[] {
  const gate = of(model, 'gate').find((g) => g.dir?.y === -1 && g.cells.some((c) => c.x === 0));
  const way = keysOf([...of(model, 'path', 'drive', 'porch'), ...(gate ? [gate] : [])]);
  const wide = (c: CellPoint): boolean => [0, -1].some((dx) => [0, -1].some((dy) => [0, 1].every((i) => [0, 1].every((j) => way.has(cellKey(c.x + dx + i, c.y + dy + j))))));
  // Without a gate, the walk starts at its outermost cell nearest the door's axis (the door's outside cell is (0, 0)).
  const start = gate?.cells[0] ?? [...way].map((k) => k.split(',').map(Number) as [number, number]).map(([x, y]) => ({ x, y })).reduce((p, q) => (q.y > p.y || (q.y === p.y && Math.abs(q.x) < Math.abs(p.x)) ? q : p));
  if (!start) return ['no way in'];
  const seen = new Set([cellKey(start.x, start.y)]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    for (const s of SIDES) {
      const next = { x: at.x + s.x, y: at.y + s.y };
      const key = cellKey(next.x, next.y);
      if (way.has(key) && wide(next) && !seen.has(key)) seen.add(key) && queue.push(next);
    }
  }
  return seen.has(cellKey(0, 0)) ? [] : ['the front door is not reached from the gate along a way two cells wide'];
}

/** 20. Outbuildings stand on the lot, off the house, each reached by a path; the crypt farthest from the service yard. */
function outbuildings(model: DungeonModel): string[] {
  const lot = model.floors[0]!.grounds!.lot;
  const house = houseKeys(model.floors[0]!);
  const paths = keysOf(of(model, 'path', 'drive'));
  const out: string[] = [];
  const buildings = of(model, 'outbuilding');
  for (const b of buildings) {
    if (b.cells.some((c) => house.has(cellKey(c.x, c.y)) || c.x < lot.x || c.y < lot.y || c.x >= lot.x + lot.w || c.y >= lot.y + lot.h)) out.push(`${b.use} off the lot or in the house`);
    if (!b.door || !paths.has(cellKey(b.door.x, b.door.y))) out.push(`${b.use} reached by no path`);
  }
  const yard = buildings.find((b) => b.use === 'carriage-house');
  const crypt = buildings.find((b) => b.use === 'crypt');
  if (yard && crypt) {
    const d = (b: GroundsPiece): number => Math.hypot(b.cells[0]!.x - yard.cells[0]!.x, b.cells[0]!.y - yard.cells[0]!.y);
    if (buildings.some((b) => b !== yard && d(b) > d(crypt))) out.push('the crypt is not the outbuilding farthest from the service yard');
  }
  return out;
}

/** Trees stand on the lawn, never on a path. */
function treesOnLawn(model: DungeonModel): string[] {
  const ways = keysOf(of(model, 'path', 'drive', 'porch', 'gate'));
  return of(model, 'tree').filter((t) => t.cells.some((c) => ways.has(cellKey(c.x, c.y)))).map((t) => `a tree on a path at ${t.cells[0]!.x},${t.cells[0]!.y}`);
}

/** The middle of some cells across x: where their axis lies. */
const axisOf = (cells: readonly CellPoint[]): number => cells.reduce((sum, c) => sum + c.x + 0.5, 0) / cells.length;

/** The way in is formal: porch, gate, drive and the fountain it turns round lie on the front door's axis. */
function approachOnAxis(model: DungeonModel): string[] {
  const floor = model.floors[0]!;
  const front = floor.doors.find((d) => d.from === null && d.x === 0 && d.y === 0);
  if (!front) return ['no front door at the origin'];
  const axis = axisOf(doorCells(front));
  const out: string[] = [];
  const off = (what: string, x: number): void => void (Math.abs(x - axis) > 1e-9 && out.push(`${what} at x ${x}, the door's axis at ${axis}`));
  for (const porch of of(model, 'porch')) off('the porch', axisOf(porch.cells));
  // The main gate is the one the way in reaches: across the door's column (a service gate may stand in the front boundary too).
  for (const gate of of(model, 'gate').filter((g) => g.dir?.y === -1 && g.cells.some((c) => c.x === 0))) off('the gate', axisOf(gate.cells));
  for (const fountain of of(model, 'garden-fountain')) {
    off('the fountain', fountain.at!.x);
    off("the fountain's island", axisOf(fountain.cells));
  }
  const approach = of(model, 'drive')[0] ?? of(model, 'path').find((p) => p.cells.some((c) => c.y === 1 && c.x === 0));
  if (approach) off('the way in', axisOf(approach.cells));
  return out;
}

const step = (a: CellPoint, b: CellPoint): CellPoint => ({ x: b.x - a.x, y: b.y - a.y });
const same = (a: CellPoint, b: CellPoint): boolean => a.x === b.x && a.y === b.y;

/** Whether a walk's cells follow one another, each beside the last: a walk one cell wide in order. */
const isChain = (cells: readonly CellPoint[]): boolean => cells.every((c, i) => i === 0 || Math.abs(c.x - cells[i - 1]!.x) + Math.abs(c.y - cells[i - 1]!.y) === 1);

/**
 * Walks are laid out: each one cell wide in order, never crossing itself, in straight legs of two cells
 * or more between its turns (no staircase), and each end at a door or meeting a gate or another way
 * square on (the cell beyond the end, in its line, is that way's); a walk meets the turning circle
 * only on the line through its fountain. A formal walk (a block, the garden door's) starts at a door
 * and another walk meets it.
 */
function walksLaidOut(model: DungeonModel): string[] {
  const floor = model.floors[0]!;
  const approach = (p: GroundsPiece): boolean => p.cells.some((c) => c.x === 0 && c.y === 1);
  const paths = of(model, 'path').filter((p) => !approach(p));
  const ways = keysOf(of(model, 'path', 'drive', 'porch', 'gate'));
  const doors = new Set([...of(model, 'outbuilding').flatMap((b) => (b.door ? [cellKey(b.door.x, b.door.y)] : [])), ...floor.doors.filter((d) => d.from === null).flatMap((d) => doorCells(d).map((c) => cellKey(c.x, c.y)))]);
  const fountain = of(model, 'garden-fountain')[0];
  const out: string[] = [];
  const beyonds: CellPoint[] = [];
  for (const { cells } of paths.filter((p) => isChain(p.cells) && p.cells.length > 1)) {
    const at = `walk from ${cells[0]!.x},${cells[0]!.y}`;
    if (new Set(cells.map((c) => cellKey(c.x, c.y))).size !== cells.length) out.push(`${at} crosses itself`);
    const steps = cells.slice(1).map((c, i) => step(cells[i]!, c));
    let leg = 1;
    let turned = false;
    for (let i = 1; i < steps.length; i++) {
      if (same(steps[i]!, steps[i - 1]!)) leg++;
      else {
        if (turned && leg < 2) out.push(`${at} turns again one cell after a turn, at ${cells[i]!.x},${cells[i]!.y}`);
        [leg, turned] = [1, true];
      }
    }
    const last = cells.length - 1;
    for (const [end, next] of [[cells[0]!, cells[1]!], [cells[last]!, cells[last - 1]!]] as const) {
      const beyond = { x: 2 * end.x - next.x, y: 2 * end.y - next.y };
      beyonds.push(beyond);
      const atDoor = doors.has(cellKey(end.x, end.y));
      if (!atDoor && !ways.has(cellKey(beyond.x, beyond.y))) out.push(`${at} ends in the lawn at ${end.x},${end.y}`);
      const atCircle = !atDoor && fountain && Math.abs(beyond.x + 0.5 - fountain.at!.x) < 4.5 && Math.abs(beyond.y + 0.5 - fountain.at!.y) < 4.5;
      if (atCircle && Math.abs(end.y + 0.5 - fountain.at!.y) > 0.5 && Math.abs(end.x + 0.5 - fountain.at!.x) > 0.5) out.push(`${at} meets the turning circle off its fountain's line at ${end.x},${end.y}`);
    }
  }
  for (const { cells } of paths.filter((p) => !isChain(p.cells))) {
    const inWalk = new Set(cells.map((c) => cellKey(c.x, c.y)));
    if (!cells.some((c) => doors.has(cellKey(c.x, c.y)))) out.push(`the formal walk at ${cells[0]!.x},${cells[0]!.y} starts at no door`);
    if (!beyonds.some((b) => inWalk.has(cellKey(b.x, b.y)))) out.push(`the formal walk at ${cells[0]!.x},${cells[0]!.y} leads nowhere`);
  }
  // A walk of one cell joins what lies either side of it in a line: a gate or a door opening on a way.
  const gates = keysOf(of(model, 'gate'));
  const doorDirs = new Map(of(model, 'outbuilding').flatMap((b) => (b.door ? [[cellKey(b.door.x, b.door.y), b.door.dir] as const] : [])));
  for (const { cells } of paths.filter((p) => p.cells.length === 1)) {
    const c = cells[0]!;
    const opening = (s: CellPoint): boolean => gates.has(cellKey(c.x + s.x, c.y + s.y)) || same(doorDirs.get(cellKey(c.x, c.y)) ?? { x: 0, y: 0 }, s);
    const through = SIDES.some((s) => opening(s) && ways.has(cellKey(c.x - s.x, c.y - s.y)));
    if (!through) out.push(`a walk of one cell at ${c.x},${c.y} joins nothing in a line`);
  }
  return out;
}

export const groundsRules = { lotHoldsHouse, closedBoundary, wideWalkIn, outbuildings, treesOnLawn, approachOnAxis, walksLaidOut };
