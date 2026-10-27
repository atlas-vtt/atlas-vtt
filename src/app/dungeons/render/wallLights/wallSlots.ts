import { cellKey, doorCells, doorSide, floorCellsOf, holdsCell } from '../../geometry';
import type { CellDir, CellPoint, DungeonProp, DungeonRoom } from '../../model';
import { PROP_SPECS } from '../../props/catalogue';
import { drawnWallPlace, OFF_WALL, type WallPlace } from '../propsAsDrawn';
import type { VisibleDungeon } from '../visibleDungeon';

/**
 * The places on a floor's walls where a light can hang: an edge of a room's floor cell that is wall
 * as drawn, on no doorway, window, chimney stack, stairwell or the row a stairwell is reached from,
 * by no piece of terrain, prop or column. Each is hung on the wall as drawn (`drawnWallPlace`), so a
 * house's inset walls and a cave's wandering outline carry it as a cell's edge does.
 */

export const SIDES: readonly CellDir[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export interface WallSlot {
  room: number;
  /** The room's floor cell the light hangs in. */
  cell: CellPoint;
  /** The way from that cell to its wall. */
  side: CellDir;
  /** Where the drawing hangs on the drawn wall. */
  place: WallPlace;
}

/** How far along the wall either side of a light the drawn wall must run straight: the drawing's half width and a little more. */
const STRAIGHT_HALF = 0.2;
/** How far a drawn wall may lie from a light's wall line under it, in cells: built walls run straight, a cave's wander. */
const STRAIGHT_TOLERANCE = { built: 0.04, cave: 0.12 } as const;
/** How far from a cell's edge its drawn wall may lie: a house's outer wall is drawn back 0.17. */
const SNAP_REACH = { built: 0.3, cave: 0.65 } as const;
/** How far a light keeps from a free-standing piece's reach or a column, in cells. */
const PIECE_CLEARANCE = 0.3;

const edgeKey = (c: CellPoint, d: CellDir): string => `${c.x},${c.y},${d.x},${d.y}`;

/** The reach of a piece about its centre: a disc's, or half a cell piece's diagonal. */
function pieceReach(prop: DungeonProp): number {
  if (prop.size) return Math.hypot(prop.size.along, prop.size.out) / 2;
  const { footprint } = PROP_SPECS[prop.kind];
  return 'reach' in footprint ? footprint.reach * prop.scale : Math.hypot(footprint.along, footprint.out) / 2;
}

export class WallSlots {
  private readonly blockedEdges = new Set<string>();
  private readonly blockedCells = new Set<string>();
  private readonly stacks = new Set<string>();
  private readonly cave: boolean;
  private readonly byRoom = new Map<number, WallSlot[]>();

  constructor(private readonly dungeon: VisibleDungeon, private readonly props: readonly DungeonProp[]) {
    const { floor } = dungeon;
    this.cave = floor.cave !== undefined;
    // Every door, a hidden wing's secret one too: a light never hangs on a door.
    for (const door of floor.doors) {
      for (const room of [door.from, door.to]) {
        if (room === null) continue;
        const d = door.from === room ? door.dir : { x: -door.dir.x, y: -door.dir.y } as CellDir;
        for (const c of doorSide(door, room)) this.blockedEdges.add(edgeKey(c, d));
      }
      if (!door.edge) for (const c of doorCells(door)) this.blockedCells.add(cellKey(c.x, c.y));
    }
    for (const window of floor.windows ?? []) this.blockedEdges.add(edgeKey(window, window.dir));
    for (const s of floor.stacks ?? []) for (let x = s.x; x < s.x + s.w; x++) for (let y = s.y; y < s.y + s.h; y++) this.stacks.add(cellKey(x, y));
    for (const piece of floor.terrain) for (const c of piece.cells) this.blockedCells.add(cellKey(c.x, c.y));
    // A stairwell, and the rows it is reached from at either end.
    for (const s of floor.stairs) {
      const along = s.down.x !== 0 ? { x: 1, y: 0 } : { x: 0, y: 1 };
      for (let x = s.x - along.x; x < s.x + s.w + along.x; x++) for (let y = s.y - along.y; y < s.y + s.h + along.y; y++) this.blockedCells.add(cellKey(x, y));
    }
  }

  /** The room's places on its walls, worked out once. */
  of(room: DungeonRoom): readonly WallSlot[] {
    let slots = this.byRoom.get(room.id);
    if (!slots) {
      slots = this.find(room);
      this.byRoom.set(room.id, slots);
    }
    return slots;
  }

  /** Whether a point of the floor stands clear of every free-standing piece and column. */
  clearOfPieces(p: CellPoint, margin = PIECE_CLEARANCE): boolean {
    const { floor } = this.dungeon;
    for (const prop of this.props) if (Math.hypot(prop.x - p.x, prop.y - p.y) < pieceReach(prop) + margin) return false;
    for (const column of floor.columns) if (Math.hypot(column.x - p.x, column.y - p.y) < column.radius + margin + 0.1) return false;
    return true;
  }

  /** Whether a floor cell is free of terrain, doorways and stairwells (`blockedCells`). */
  freeCell(c: CellPoint): boolean {
    return !this.blockedCells.has(cellKey(c.x, c.y));
  }

  private find(room: DungeonRoom): WallSlot[] {
    const slots: WallSlot[] = [];
    for (const cell of floorCellsOf(room)) {
      if (!this.freeCell(cell)) continue;
      for (const side of SIDES) {
        const beyond = { x: cell.x + side.x, y: cell.y + side.y };
        if (holdsCell(room, beyond.x, beyond.y) || this.blockedEdges.has(edgeKey(cell, side)) || this.stacks.has(cellKey(beyond.x, beyond.y))) continue;
        const place = this.hang(cell, side);
        if (place && this.clearOfPieces(place)) slots.push({ room: room.id, cell, side, place });
      }
    }
    return slots;
  }

  /** The drawing's place on the drawn wall beyond `cell` towards `side`, where that wall runs straight under it; null where there is none. */
  private hang(cell: CellPoint, side: CellDir): WallPlace | null {
    const kind = this.cave ? 'cave' : 'built';
    const edge = { x: cell.x + 0.5 + side.x * 0.5, y: cell.y + 0.5 + side.y * 0.5 };
    const rotation = Math.atan2(-side.x, side.y);
    const place = drawnWallPlace({ x: edge.x - side.x * OFF_WALL, y: edge.y - side.y * OFF_WALL, rotation }, this.dungeon.field);
    if (!place) return null;
    const out = { x: -Math.sin(place.rotation), y: Math.cos(place.rotation) };
    const wall = { x: place.x + out.x * OFF_WALL, y: place.y + out.y * OFF_WALL };
    // On its own cell's wall: not one across a doorway or the far side of a narrow passage.
    if ((wall.x - edge.x) * side.x + (wall.y - edge.y) * side.y < -SNAP_REACH[kind] || out.x * side.x + out.y * side.y < 0.8) return null;
    if (Math.hypot(wall.x - edge.x, wall.y - edge.y) > SNAP_REACH[kind] + 0.5) return null;
    const along = { x: -out.y, y: out.x };
    const { field } = this.dungeon;
    for (const k of [-1, 1]) {
      const p = { x: wall.x + along.x * k * STRAIGHT_HALF, y: wall.y + along.y * k * STRAIGHT_HALF };
      if (Math.abs(field.distance(p.x, p.y)) > STRAIGHT_TOLERANCE[kind]) return null;
    }
    return place;
  }
}
