/**
 * Where on a floor something may grow, cell by cell. Nothing grows in a doorway, on the cell
 * before a door (a climber may hide a secret one, which is wall as drawn), on a stairwell, the row it is reached from or beside them, in a hole or on a
 * bridge, or within two cells of lava or acid. Floor plants also keep off every piece of terrain,
 * pieces, columns and water; a climber only hangs over a wall's foot, so it may hang over low
 * terrain there.
 */

import type { CellPoint, DungeonColumn, DungeonDoor, DungeonProp, DungeonRoom, DungeonStair, DungeonTerrain, TerrainKind } from '../model';
import { doorApproaches, stairsAndAround } from '../floors/stairSpots';
import { cellKey } from '../geometry';
import { propReach } from '../props/catalogue';

export interface GrowthFloor {
  rooms: readonly DungeonRoom[];
  doors: readonly DungeonDoor[];
  stairs: readonly DungeonStair[];
  columns: readonly DungeonColumn[];
  props: readonly DungeonProp[];
  terrain: readonly DungeonTerrain[];
  waterCells: readonly CellPoint[];
  /** In a house, whether a cell lies outside it: its outer walls stand on the edges towards such cells. */
  outside?: (x: number, y: number) => boolean;
}

/** Terrain a climber may hang over at a wall's foot: what lies on the floor, low and walked. */
const UNDER_CLIMBERS: ReadonlySet<TerrainKind> = new Set(['shallow-water', 'rubble-field', 'broken-floor', 'brambles', 'thicket', 'tangled-roots', 'rubble-heap']);
/** How far from lava or acid nothing grows, in cells. */
const SCORCHED = 2;

const STEPS: readonly CellPoint[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

export class GrowthSpace {
  /** Cells nothing grows on, by key. */
  private readonly barred = new Set<string>();
  /** Cells floor plants keep off besides, by key. */
  private readonly occupied = new Set<string>();
  private readonly wet: ReadonlySet<string>;

  constructor(readonly floor: GrowthFloor) {
    const { rooms, doors, stairs, terrain, props, columns } = floor;
    this.wet = new Set(floor.waterCells.map((c) => cellKey(c.x, c.y)));
    for (const key of stairsAndAround(stairs)) this.barred.add(key);
    for (const door of doors) this.barred.add(cellKey(door.x, door.y));
    // A secret door is wall as the map draws it, so a climber may cover it; floor plants keep off its approach.
    const shown = doors.filter((d) => d.kind !== 'secret');
    for (const room of rooms) for (const c of doorApproaches(room, shown)) this.barred.add(cellKey(c.x, c.y));
    for (const room of rooms) for (const c of doorApproaches(room, doors)) this.occupied.add(cellKey(c.x, c.y));
    for (const piece of terrain) {
      const burns = piece.traits.hazard === 'lava' || piece.traits.hazard === 'acid';
      for (const c of piece.cells) {
        this.occupied.add(cellKey(c.x, c.y));
        if (piece.opening || piece.kind === 'bridge' || !UNDER_CLIMBERS.has(piece.kind)) this.barred.add(cellKey(c.x, c.y));
        if (burns) for (let dx = -SCORCHED; dx <= SCORCHED; dx++) for (let dy = -SCORCHED; dy <= SCORCHED; dy++) this.barred.add(cellKey(c.x + dx, c.y + dy));
      }
    }
    for (const prop of props) this.occupy(prop.x, prop.y, propReach(prop.kind) * prop.scale);
    for (const column of columns) this.occupy(column.x, column.y, column.radius);
    for (const key of this.wet) this.occupied.add(key);
  }

  /** Marks the cells a disc of `radius` round (x, y) reaches into. */
  private occupy(x: number, y: number, radius: number): void {
    for (let cy = Math.floor(y - radius); cy <= Math.floor(y + radius); cy++) {
      for (let cx = Math.floor(x - radius); cx <= Math.floor(x + radius); cx++) {
        const dx = Math.max(cx - x, 0, x - (cx + 1));
        const dy = Math.max(cy - y, 0, y - (cy + 1));
        if (Math.hypot(dx, dy) < radius) this.occupied.add(cellKey(cx, cy));
      }
    }
  }

  /** Whether a climber may hang over the cell at a wall's foot. */
  forClimber(c: CellPoint): boolean {
    return !this.barred.has(cellKey(c.x, c.y));
  }

  /** Whether a floor plant may grow on the cell (which must be floor). */
  forPlant(c: CellPoint): boolean {
    const key = cellKey(c.x, c.y);
    return !this.barred.has(key) && !this.occupied.has(key);
  }

  isWet(c: CellPoint): boolean {
    return this.wet.has(cellKey(c.x, c.y));
  }

  /** A dry cell beside water. */
  isShore(c: CellPoint): boolean {
    return !this.isWet(c) && STEPS.some((d) => this.isWet({ x: c.x + d.x, y: c.y + d.y }));
  }

  /** Whether water lies on or beside the cell. */
  byWater(c: CellPoint): boolean {
    return this.isWet(c) || this.isShore(c);
  }
}

/** The cells of a room's floor: a cave's cells, its rectangle, or of a round room the cells whose middle lies well inside the circle. */
export function roomFloorCells(room: DungeonRoom): CellPoint[] {
  if (room.cells) return room.cells;
  const out: CellPoint[] = [];
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const r = Math.sqrt(room.w * room.w + 1) / 2 - 0.5;
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) if (!room.rotunda || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) out.push({ x, y });
  }
  return out;
}
