import { cellKey, floorCellsOf } from '../../../../src/app/dungeons/geometry';
import { levelOf, stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonProp } from '../../../../src/app/dungeons/model';
import { SIDES, houseKeys, owners, stackCells } from './houseCells';

/**
 * Where a house's chimney stacks and fireplaces stand (report 2026-10-25-mansion-chimneys-research,
 * rules C1–C7), checked on a generated model alone, apart from the planner: each returns the problems it finds.
 */

/** The rooms a manor heats: reception rooms, family bedrooms, the kitchen's range and the servants' hall. */
const WARMED = new Set(['entrance-hall', 'drawing-room', 'dining-room', 'library', 'saloon', 'parlour', 'study', 'ballroom', 'master-bedroom', 'bedroom', 'nursery', 'kitchen', 'servants-hall']);
/** The rooms a stack is planned for: each borders one. */
const MAIN = new Set(['drawing-room', 'dining-room', 'kitchen', 'master-bedroom']);

/** The fewest ground cells per stack a house may have, and the most stacks of any house: looser than the planner's plan, which its main rooms may exceed. */
const FEWEST_CELLS_PER_STACK = 80;
const MOST_STACKS = 7;
/** The most fireplaces on one floor, and the fewest on the entrance floor. */
const MOST_FIREPLACES = 10;
const FEWEST_FIREPLACES = 2;
/** Of the fireplaces whose stack has a heated room on its far face, the share with a fireplace there too, at least. */
export const BACK_TO_BACK = 0.7;

const hearthsOf = (floor: DungeonFloor): DungeonProp[] => floor.props.filter((p) => p.kind === 'hearth');

/** A fireplace's two cells and the cell behind each, against the wall it stands on. */
function hearthCells(hearth: DungeonProp): { cells: CellPoint[]; behind: CellPoint[] } {
  const front = { x: Math.round(Math.sin(hearth.rotation)), y: Math.round(-Math.cos(hearth.rotation)) };
  const along = { x: -front.y, y: front.x };
  const cells = [-0.5, 0.5].map((t) => ({ x: Math.floor(hearth.x + along.x * t), y: Math.floor(hearth.y + along.y * t) }));
  return { cells, behind: cells.map((c) => ({ x: c.x - front.x, y: c.y - front.y })) };
}

/** C1. A house has a stack for every `FEWEST_CELLS_PER_STACK` ground cells at most (four may stand in any house), `MOST_STACKS` in all, and one at least. */
export function stacksPerHouse(model: DungeonModel): string[] {
  const ground = model.floors[0]!;
  const n = ground.stacks?.length ?? 0;
  const most = Math.min(MOST_STACKS, Math.max(4, Math.ceil(houseKeys(ground).size / FEWEST_CELLS_PER_STACK)));
  return n < 1 || n > most ? [`${n} stacks on ${houseKeys(ground).size} ground cells (1–${most})`] : [];
}

/** C2. Fireplaces only in the rooms a manor heats, and none in the cellar. */
export function fireplacesWhereWarmed(model: DungeonModel): string[] {
  const stack = stackOf(model);
  return model.floors.flatMap((floor, i) =>
    hearthsOf(floor).flatMap((h) => {
      const type = floor.rooms[h.room]?.type ?? '';
      if (levelOf(stack, i) < 0) return [`floor ${i}: a fireplace in the cellar's ${type}`];
      return WARMED.has(type) ? [] : [`floor ${i}: a fireplace in a ${type}`];
    }),
  );
}

/** C3. Every fireplace stands flat against a stack: both its cells have stack behind them. */
export function fireplacesOnStacks(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, i) => {
    const stacks = stackCells(floor);
    return hearthsOf(floor)
      .filter((h) => !hearthCells(h).behind.every((c) => stacks.has(cellKey(c.x, c.y))))
      .map((h) => `floor ${i}: a fireplace at ${h.x.toFixed(1)},${h.y.toFixed(1)} on no stack`);
  });
}

/** C4. No stack stands in an outer wall, where the facade's windows are; none takes a window's edge. */
export function stacksInside(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, i) => {
    const house = houseKeys(floor);
    const stacks = stackCells(floor);
    const out: string[] = [];
    for (const k of stacks) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      if (SIDES.some((s) => !house.has(cellKey(x + s.x, y + s.y)))) out.push(`floor ${i}: stack cell ${k} in an outer wall`);
    }
    for (const w of floor.windows ?? []) if (stacks.has(cellKey(w.x, w.y))) out.push(`floor ${i}: a window on stack cell ${w.x},${w.y}`);
    return out;
  });
}

/** C5. The drawing room, dining room, kitchen and master bedroom each border a stack (unless they are the climax or a five-room stage). */
export function mainRoomsWarm(model: DungeonModel): string[] {
  return model.floors.flatMap((floor, i) => {
    const stacks = stackCells(floor);
    return floor.rooms
      .filter((room) => MAIN.has(room.type ?? '') && !room.boss && !room.stage)
      .filter((room) => !roomBorders(room, stacks))
      .map((room) => `floor ${i}: the ${room.type} borders no stack`);
  });
}

function roomBorders(room: DungeonFloor['rooms'][number], stacks: ReadonlySet<string>): boolean {
  return floorCellsOf(room).some((c) => SIDES.some((s) => stacks.has(cellKey(c.x + s.x, c.y + s.y))));
}

/** C6. At most `MOST_FIREPLACES` fireplaces on a floor, and `FEWEST_FIREPLACES` at least on the entrance floor of a house that is no ruin (which loses pieces) and no five-room dungeon. */
export function fireplacesPerFloor(model: DungeonModel): string[] {
  const counts = model.floors.map((floor) => hearthsOf(floor).length);
  const out = counts.flatMap((n, i) => (n > MOST_FIREPLACES ? [`floor ${i}: ${n} fireplaces`] : []));
  if (!model.tags.includes('ruined') && !model.floors[0]!.rooms.some((r) => r.stage) && counts[0]! < FEWEST_FIREPLACES) out.push(`the entrance floor has ${counts[0]} fireplaces`);
  return out;
}

/**
 * A floor's fireplaces, those whose stack has a heated room on its far face (`facing`), and those
 * with a fireplace there: back to back, sharing the stack (`paired`).
 */
export function backToBack(floor: DungeonFloor): { fireplaces: number; facing: number; paired: number } {
  const hearths = hearthsOf(floor).map((h) => hearthCells(h));
  const at = new Set(hearths.flatMap((h) => h.cells.map((c) => cellKey(c.x, c.y))));
  const own = owners(floor);
  // Across a stack one cell thick: the cells two behind a fireplace's.
  const across = (h: ReturnType<typeof hearthCells>): string[] => h.cells.map((c, k) => cellKey(2 * h.behind[k]!.x - c.x, 2 * h.behind[k]!.y - c.y));
  const facing = hearths.filter((h) => across(h).some((k) => WARMED.has(floor.rooms[own.get(k) ?? -1]?.type ?? '')));
  return { fireplaces: hearths.length, facing: facing.length, paired: facing.filter((h) => across(h).some((k) => at.has(k))).length };
}

/** The numbers of a set of houses' stacks and fireplaces, for the report (`VITE_CHIMNEY_STATS=print`). */
export function chimneyStats(models: readonly DungeonModel[]): Record<string, number | string> {
  const stacks: number[] = [];
  const perFloor: number[] = [];
  let fireplaces = 0;
  let facing = 0;
  let paired = 0;
  for (const model of models) {
    stacks.push(model.floors[0]!.stacks?.length ?? 0);
    for (const floor of model.floors) {
      const b = backToBack(floor);
      perFloor.push(b.fireplaces);
      fireplaces += b.fireplaces;
      facing += b.facing;
      paired += b.paired;
    }
  }
  const mean = (xs: number[]): string => (xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(2);
  return {
    'stacks per house': mean(stacks),
    'most stacks': Math.max(...stacks),
    'fireplaces per floor': mean(perFloor),
    'most fireplaces on a floor': Math.max(...perFloor),
    'back-to-back share': (paired / Math.max(1, fireplaces)).toFixed(3),
    'back to back where both rooms are heated': (paired / Math.max(1, facing)).toFixed(3),
  };
}
