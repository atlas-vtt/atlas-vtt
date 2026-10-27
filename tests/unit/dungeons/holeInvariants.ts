/**
 * Checks of holes through floors, written apart from the generator. A hole lies over the floor of a
 * room on every floor physically below it down to where its fall ends; a gallery (or another
 * opening cut for the room below) opens into that room right below and lets nothing fall; a light
 * well opens for its own room's reason into whatever room lies below it.
 */

import { floorBelow, stackOf } from '../../../src/app/dungeons/floors/floorStack';
import type { CellPoint, DungeonModel, DungeonRoom, DungeonTerrain, TerrainKind } from '../../../src/app/dungeons/model';
import { FEATURES } from '../../../src/app/dungeons/themes/features';
import { THEMES } from '../../../src/app/dungeons/themes/themes';
import { inFloor, stairCells } from './terrainInvariants';

const key = (c: CellPoint): string => `${c.x},${c.y}`;
/** Openings cut for the room below them, which nothing falls through onto rubble. */
const CUT_FOR_BELOW: ReadonlySet<TerrainKind> = new Set(['gallery', 'murder-hole']);

/** Whether a room's type has a reason to have the floor above it opened by a hole of `kind`. */
export function opensAbove(model: DungeonModel, room: DungeonRoom, kind: TerrainKind): boolean {
  const spec = room.type ? THEMES[model.theme].programme?.rooms.find((s) => s.id === room.type) : undefined;
  return (spec?.terrain.features ?? []).some((reason) => FEATURES[reason].at === 'above' && FEATURES[reason].kinds.includes(kind));
}

/** The floors physically below `k`, nearest first. */
export function floorsBelow(model: DungeonModel, k: number): number[] {
  const stack = stackOf(model);
  const out: number[] = [];
  for (let at = floorBelow(stack, k); at !== null; at = floorBelow(stack, at)) out.push(at);
  return out;
}

/** The room of floor `j` whose floor holds every cell, if one does. */
function roomUnder(model: DungeonModel, j: number, cells: readonly CellPoint[]): DungeonRoom | undefined {
  return model.floors[j]?.rooms.find((r) => r.kind === 'room' && cells.every((c) => inFloor(r, c)));
}

/** Whether the room an opening is cut in has a reason of its own to open its floor (a landing's light well). */
function opensHere(model: DungeonModel, k: number, hole: DungeonTerrain): boolean {
  const room = model.floors[k]?.rooms[hole.room];
  const spec = room?.type ? THEMES[model.theme].programme?.rooms.find((s) => s.id === room.type) : undefined;
  return (spec?.terrain.features ?? []).some((reason) => FEATURES[reason].at === 'here' && FEATURES[reason].upperFloor === true && FEATURES[reason].kinds.includes(hole.kind));
}

/** An opening cut for the room right below (a gallery over the boss room, or one its type has a reason for), or for its own room's reason over a room below, never its stairs. */
function openingProblems(model: DungeonModel, k: number, hole: DungeonTerrain, where: string): string[] {
  const below = floorsBelow(model, k)[0];
  const room = below === undefined ? undefined : roomUnder(model, below, hole.cells);
  const own = opensHere(model, k, hole);
  if (hole.opening?.bottom !== below || !room || !(room.boss || opensAbove(model, room, hole.kind) || own)) return [`${where} does not open into a room below that has a reason for it`];
  const stairs = new Set(stairCells(model.floors[below]!).map(key));
  if (own && hole.cells.some((c) => stairs.has(key(c)))) return [`${where} opens over a stairwell`];
  return model.floors[below]!.terrain.some((p) => p.under === hole.opening?.link) ? [`${where} lets something fall into the room below`] : [];
}

/**
 * Holes line up: a hole lies over the floor of a room on every floor below it down to where its fall
 * ends, never over a stairwell there; each floor it opens through holds a hole of the same link
 * over the same cells, and the floor it ends on the rubble under it. A bottomless hole opens
 * through every floor below. A gallery opens into the room right below that has a reason for it.
 */
export function holeProblems(model: DungeonModel): string[] {
  const out: string[] = [];
  model.floors.forEach((floor, k) => {
    const below = floorsBelow(model, k);
    for (const hole of floor.terrain.filter((p) => p.opening)) {
      const { bottom, link } = hole.opening!;
      const where = `floor ${k} ${hole.kind} ${hole.id}`;
      const cells = new Set(hole.cells.map(key));
      const same = (p: DungeonTerrain): boolean => p.cells.length === cells.size && p.cells.every((c) => cells.has(key(c)));
      if (CUT_FOR_BELOW.has(hole.kind)) {
        out.push(...openingProblems(model, k, hole, where));
        continue;
      }
      if (bottom !== null && !below.includes(bottom)) out.push(`${where} falls to floor ${bottom}, which is not below it`);
      const through = bottom === null ? below : below.slice(0, below.indexOf(bottom) + 1);
      for (const j of through) {
        const under = model.floors[j]!;
        if (!roomUnder(model, j, hole.cells)) out.push(`${where} lies over no room of floor ${j}`);
        const stairs = new Set(stairCells(under).map(key));
        if (hole.cells.some((c) => stairs.has(key(c)))) out.push(`${where} lies over a stairwell of floor ${j}`);
        const ending = j === bottom;
        const match = under.terrain.find((p) => (ending ? p.kind === 'chasm-floor' && p.under === link : p.opening?.link === link) && same(p));
        if (!match) out.push(`${where}: floor ${j} has no ${ending ? 'rubble under it' : 'hole of the same link'}`);
      }
    }
  });
  return out;
}
