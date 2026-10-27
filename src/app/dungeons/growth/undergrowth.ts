/**
 * Undergrowth too thick to walk through freely, as terrain (difficult, never blocking): brambles,
 * thick ferns or tangled roots in some rooms of an overgrown dungeon, a clump of two to six whole
 * cells grown out from a wall, the more often the more light the room gets. Placed after the
 * water and before the pieces, which keep off it. Never by a stairwell, a doorway or lava. In
 * a built theme's rooms (only in a ruin) it grows only where light or water comes in: by an outer
 * wall, under an opening in the floor above, by water.
 */

import type { CellPoint, DungeonRoom, DungeonTerrain } from '../model';
import { cellKey } from '../geometry';
import { chance, floorStream, int, type Rng, weighted } from '../rng';
import { draft } from '../terrain/catalog';
import { FIGHT_AREA } from '../terrain/cover';
import type { FloorTerrain } from '../terrain/floorTerrain';
import type { RoomCells } from '../terrain/roomCells';
import type { Flora, UndergrowthKind } from './flora';
import { GrowthSpace } from './growthSpace';
import { outerWallCells } from './outerWalls';
import { roomLight } from './placeGrowth';

/** Undergrowth that wants light: brambles and ferns; roots grow in the dark. */
const GREEN: Readonly<Record<UndergrowthKind, boolean>> = { brambles: true, thicket: true, 'tangled-roots': false };

function clump(rng: Rng, rc: RoomCells, start: CellPoint, size: number, fits: (c: CellPoint) => boolean): CellPoint[] {
  const cells = [start];
  const seen = new Set([cellKey(start.x, start.y)]);
  while (cells.length < size) {
    const options = cells.flatMap((c) => [{ x: c.x + 1, y: c.y }, { x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }, { x: c.x, y: c.y - 1 }]).filter((c) => !seen.has(cellKey(c.x, c.y)) && rc.isFree(c) && fits(c));
    if (!options.length) break;
    const next = options[Math.floor(rng() * options.length)]!;
    seen.add(cellKey(next.x, next.y));
    cells.push(next);
  }
  return cells;
}

export interface UndergrowthSetting {
  /** A built theme's dungeon (Fortress, Mansion): its typed rooms are kept unless it lies in ruins. */
  built: boolean;
  ruined: boolean;
  /** A storey above the entrance floor, lit by windows the map does not draw. */
  aboveGround: boolean;
  /** The cells under an opening in the floor above, by key: light falls in there. */
  openAbove: ReadonlySet<string>;
  /** In a house, whether a cell lies outside it (`GrowthFloor.outside`). */
  outside?: (x: number, y: number) => boolean;
  /** Which kinds may grow in a room (a cave's life keeps to its zones); unset lets every kind grow everywhere. */
  mayGrow?: (room: number, kind: UndergrowthKind) => boolean;
}

/** How near light or water a built room's undergrowth may start, in cells. */
const LIGHT_REACH = 1;

/** The cells of a built room where plants may root: by an outer wall, under an opening above, by water; by key. */
function litCells(rc: RoomCells, rooms: readonly DungeonRoom[], space: GrowthSpace, openAbove: ReadonlySet<string>, outside?: (x: number, y: number) => boolean): Set<string> {
  const sources = new Set([...outerWallCells(rc.room, rooms, outside), ...openAbove]);
  const nearSource = (c: CellPoint): boolean => {
    for (let dy = -LIGHT_REACH; dy <= LIGHT_REACH; dy++) for (let dx = -LIGHT_REACH; dx <= LIGHT_REACH; dx++) if (sources.has(cellKey(c.x + dx, c.y + dy))) return true;
    return false;
  };
  const out = new Set<string>();
  for (let i = 0; i < rc.depth; i++) for (let j = 0; j < rc.width; j++) {
    const c = rc.cell(i, j);
    if (rc.isFloor(c) && (space.byWater(c) || nearSource(c))) out.add(cellKey(c.x, c.y));
  }
  return out;
}

/** Adds the floor's undergrowth to its terrain; returns every piece. */
export function addUndergrowth(seed: number, floor: FloorTerrain, waterCells: readonly CellPoint[], flora: Flora | null, setting: UndergrowthSetting): DungeonTerrain[] {
  const { built, ruined, aboveGround, mayGrow = (): boolean => true } = setting;
  if (!flora?.rich) return floor.pieces;
  const { plan } = floor;
  const space = new GrowthSpace({ ...plan, props: [], terrain: floor.pieces, waterCells });
  const light = roomLight({ rooms: plan.rooms, doors: plan.doors, floor: floor.index, aboveGround });
  for (const room of plan.rooms) {
    const rc = floor.room(room.id);
    if (!rc || rc.floorCount < FIGHT_AREA || room.stage !== undefined) continue;
    // A built theme's rooms are kept: only a ruin lets thickets in, and only where light or water comes in.
    if (room.type && built && !ruined) continue;
    const lit = room.type && built ? litCells(rc, plan.rooms, space, setting.openAbove, setting.outside) : null;
    if (lit?.size === 0) continue;
    const rng = floorStream(seed, 'growth', floor.index, `undergrowth:${room.id}`);
    const l = light[room.id] ?? 0;
    if (!chance(rng, 0.2 + 0.4 * l)) continue;
    const clumps = rc.floorCount > 30 && chance(rng, 0.4) ? 2 : 1;
    for (let k = 0; k < clumps; k++) {
      const kind = weighted(rng, flora.undergrowth.map(([kind, w]) => [kind, GREEN[kind] ? w * l : w] as const));
      if (!mayGrow(room.id, kind)) continue;
      const fits = (c: CellPoint): boolean => !rc.nearStairs(c) && space.forPlant(c) && (!lit || lit.has(cellKey(c.x, c.y)));
      const starts: CellPoint[] = [];
      for (let i = 0; i < rc.depth; i++) for (let j = 0; j < rc.width; j++) {
        const c = rc.cell(i, j);
        // In a built room, wherever light or water comes in; elsewhere from a wall.
        const rooted = lit !== null || i === 0 || j === 0 || i === rc.depth - 1 || j === rc.width - 1;
        if (rooted && rc.isFree(c) && fits(c)) starts.push(c);
      }
      const start = starts[Math.floor(rng() * starts.length)];
      if (!start) continue;
      const cells = clump(rng, rc, start, Math.min(int(rng, 2, 6), Math.floor(rc.floorCount / 5)), fits);
      // Nature never grows a second clump as the first one's mirror image.
      if (cells.length >= 2 && !floor.mirrorsAnother(room, kind, cells)) floor.place(draft(kind, room.id, cells));
    }
  }
  return floor.pieces;
}
