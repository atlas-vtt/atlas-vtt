import type { DungeonDoor, DungeonFloor, DungeonModel, DungeonRoom } from '../model';
import { secretWingOf } from '../secretWings';
import type { DungeonView } from '../style';
import { openGroundOf, wayExtent, wayOutsOf, type WayOut } from './cave/mouth/wayOut';
import { caveFloorShapes } from './cave/visibleCave';
import { doorShape, doorShapes, roomShape, shapeBounds, shapeDistance, unionBounds, type Bounds, type FloorShape, type Vec } from './geometry';
import { type HouseLayout, houseLayout } from './houseShapes';

/**
 * What a view shows of one floor of a dungeon: secret wings leave with their doors when secrets
 * are hidden, and so does every wing the GM hid (`DungeonFloor.hiddenWings`); a secret door is
 * wall, so its cell is no floor.
 */
export interface VisibleFloor {
  model: DungeonModel;
  /** The floor's index in `model.floors`. */
  index: number;
  floor: DungeonFloor;
  rooms: DungeonRoom[];
  doors: DungeonDoor[];
  /** Openings as wide as their cell: between two corridors, so the passage runs on unbroken. */
  wide: ReadonlySet<DungeonDoor>;
  /** Room floors, then door cells (a narrow opening's narrowed by its jambs). */
  floors: FloorShape[];
  /** The floors with every door cell whole: what courses of brick and stone are laid around. */
  outlines: FloorShape[];
  roomShapes: Map<number, FloorShape>;
  /** A cave's ways out, one before each entrance; none on a built floor. */
  ways: WayOut[];
  /** A house's cells and doorways (`DungeonFloor.walls === 'edges'`), as its floors were drawn from them. */
  house?: HouseLayout;
  /** Of the floors, of a house's lot once its garden is drawn, and of what a cave's ways out may cover. */
  bounds: Bounds;
}

export interface VisibleDungeon extends VisibleFloor {
  field: FloorField;
  /** The open ground before every way in, where no rock stands (`openGroundOf`). */
  open: Vec[][];
}

function isWideOpening(door: DungeonDoor, byId: ReadonlyMap<number, DungeonRoom>): boolean {
  if (door.kind !== 'opening' || door.from === null || door.to === null) return false;
  return byId.get(door.from)?.kind !== 'room' && byId.get(door.to)?.kind !== 'room';
}

/** How much of a way out may lie in the map's margin, in cells: the ground has faded to nothing there. */
const WAY_INSIDE_MARGIN = 1.6;

export function visibleFloor(model: DungeonModel, view: Pick<DungeonView, 'secrets'>, index = 0): VisibleFloor {
  const floor = model.floors[index] ?? model.floors[0];
  if (!floor) throw new Error('a dungeon without floors');
  const hidden = new Set(floor.hiddenWings ?? []);
  const rooms = floor.rooms.filter(room => room.wing !== 'secret' || (view.secrets && !hidden.has(secretWingOf(floor.rooms, room.id) ?? room.id)));
  const shown = new Map(rooms.map(room => [room.id, room] as const));
  const doors = floor.doors.filter(door => (door.from === null || shown.has(door.from)) && (door.to === null || shown.has(door.to)));
  const cave = floor.cave !== undefined;
  const open = doors.filter(door => door.kind !== 'secret');
  if (floor.walls === 'edges') return withBounds({ model, index, floor, rooms, doors, ways: [], ...houseFloors(houseLayout(floor, shown, doors), open) });
  const wide = new Set(cave ? [] : doors.filter(door => isWideOpening(door, shown)));
  const roomShapes = new Map(rooms.map(room => [room.id, roomShape(room)] as const));
  // A cave's narrows are drawn at their full width, as part of its traced floor.
  const floors = cave ? caveFloorShapes(model, index, rooms, doors) : [...roomShapes.values(), ...open.flatMap(door => doorShapes(door, !wide.has(door) && door.kind === 'opening'))];
  const outlines = cave ? floors : [...roomShapes.values(), ...open.map(doorShape)];
  const ways = wayOutsOf(floor, doors, model.seed + index * 101);
  return withBounds({ model, index, floor, rooms, doors, wide, floors, outlines, roomShapes, ways });
}

/** A house's floors (`houseShapes.ts`): every doorway's floor whole, and every opening drawn as wide as it is, its grid lines across. */
function houseFloors(house: HouseLayout, open: readonly DungeonDoor[]): Pick<VisibleFloor, 'wide' | 'floors' | 'outlines' | 'roomShapes' | 'house'> {
  const floors = [...house.roomShapes.values(), ...open.map(door => house.doorways.get(door)!)];
  return { wide: new Set(open.filter(door => door.kind === 'opening')), floors, outlines: floors, roomShapes: house.roomShapes, house };
}

function withBounds(visible: Omit<VisibleFloor, 'bounds'>): VisibleFloor {
  const { floors, ways } = visible;
  // A house's lot lies on its map once its garden is drawn.
  const lot = visible.floor.grounds?.pieces.some(piece => piece.kind === 'garden') ? [{ kind: 'rect', ...visible.floor.grounds.lot } as FloorShape] : [];
  const floorBounds = floors.length ? unionBounds([...floors, ...lot].map(shape => shapeBounds(shape))) : { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  // A cave's ways out fade into the paper before the map's edge: the margin grows where one would reach it.
  const bounds = unionBounds([floorBounds, ...ways.map(way => wayExtent(way, way.length - WAY_INSIDE_MARGIN))]);
  return { ...visible, bounds };
}

/** One floor as drawn (`visibleFloor`), with the distance field its surroundings are drawn from. */
export function visibleDungeon(model: DungeonModel, view: Pick<DungeonView, 'secrets'>, index = 0): VisibleDungeon {
  const visible = visibleFloor(model, view, index);
  const field = new FloorField(visible.floors);
  return { ...visible, field, open: openGroundOf({ ...visible, field }) };
}

/** Of every floor as the view shows it: all floors' images share it, so they lie over each other exactly. */
export function dungeonBounds(model: DungeonModel, view: Pick<DungeonView, 'secrets'>): Bounds {
  return unionBounds(model.floors.map((_, index) => visibleFloor(model, view, index).bounds));
}

/** How far from the floors the field answers exactly; farther points read as this far. */
const REACH = 3;

/**
 * Signed distance to the union of the floors (negative inside), answered from an index of the
 * shapes near each cell, so sampling a large dungeon's surroundings stays cheap.
 */
export class FloorField {
  private readonly cells = new Map<number, FloorShape[]>();

  constructor(readonly shapes: readonly FloorShape[]) {
    for (const shape of shapes) {
      const b = shapeBounds(shape, REACH);
      for (let y = Math.floor(b.minY); y <= Math.floor(b.maxY); y++) {
        for (let x = Math.floor(b.minX); x <= Math.floor(b.maxX); x++) {
          const key = cellKey(x, y);
          const list = this.cells.get(key);
          if (list) list.push(shape);
          else this.cells.set(key, [shape]);
        }
      }
    }
  }

  distance(x: number, y: number): number {
    const list = this.cells.get(cellKey(Math.floor(x), Math.floor(y)));
    if (!list) return REACH;
    let best = REACH;
    for (const shape of list) best = Math.min(best, shapeDistance(shape, x, y));
    return best;
  }

  /** The direction away from the nearest floor, by central differences. */
  gradient(x: number, y: number): { x: number; y: number } {
    const e = 0.02;
    const gx = this.distance(x + e, y) - this.distance(x - e, y);
    const gy = this.distance(x, y + e) - this.distance(x, y - e);
    const len = Math.hypot(gx, gy) || 1;
    return { x: gx / len, y: gy / len };
  }
}

function cellKey(x: number, y: number): number {
  return (x + 32768) * 65536 + (y + 32768);
}
