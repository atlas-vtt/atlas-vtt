import { levelOf, stackOf } from '../../floors/floorStack';
import type { DungeonRoom } from '../../model';
import type { RoomTypeId } from '../../themes/roomTypes';
import type { ArtScene } from '../art/artScene';
import { shapeDistance, type FloorShape } from '../geometry';
import type { CrayonGroundId } from './ground';

/**
 * What each part of a floor is laid with in Crayon, by what its room was built for: a built floor's
 * flagstones (a stable's packed earth), a house's boards (its wet and cool rooms and its cellar
 * flagged in stone), a cave's bare rock.
 */

/** What a built floor or a house's is laid with. */
export type FloorMaterial = 'stone' | 'earth' | 'boards';

/** Rooms of a house laid with flagstones, where water is used or things are stored cool; the rest are boarded. */
const FLAGGED_IN_A_HOUSE: ReadonlySet<RoomTypeId> = new Set(['kitchen', 'scullery', 'laundry', 'bathroom', 'servery', 'wine-cellar', 'conservatory', 'buttery', 'storeroom']);
/** Rooms of a built floor whose floor is packed earth. */
const EARTHEN: ReadonlySet<RoomTypeId> = new Set(['stable', 'gaol']);

/** A house's cellar floors are flagged throughout: they lie below its entrance floor. */
function isCellar(scene: ArtScene): boolean {
  const { model, index } = scene.env.dungeon;
  return levelOf(stackOf(model), index) < 0;
}

function materialOf(room: DungeonRoom, house: boolean, cellar: boolean): FloorMaterial {
  const type = room.type;
  if (house) return cellar || (type !== undefined && FLAGGED_IN_A_HOUSE.has(type)) ? 'stone' : 'boards';
  return type !== undefined && EARTHEN.has(type) ? 'earth' : 'stone';
}

/** Each room's shape with its material, and what door cells and doorways take: what the floor is mostly laid with. */
interface RoomMaterials {
  rooms: Map<FloorShape, FloorMaterial>;
  between: FloorMaterial;
}

function roomMaterials(scene: ArtScene): RoomMaterials {
  const { dungeon } = scene.env;
  const house = dungeon.house !== undefined;
  const cellar = house && isCellar(scene);
  const rooms = new Map<FloorShape, FloorMaterial>();
  for (const room of dungeon.rooms) {
    const shape = dungeon.roomShapes.get(room.id);
    if (shape) rooms.set(shape, materialOf(room, house, cellar));
  }
  return { rooms, between: house && !cellar ? 'boards' : 'stone' };
}

/** The floor's shapes by material. */
export function floorsByMaterial(scene: ArtScene): Map<FloorMaterial, FloorShape[]> {
  const { rooms, between } = roomMaterials(scene);
  const out = new Map<FloorMaterial, FloorShape[]>();
  for (const shape of scene.floors) {
    const material = rooms.get(shape) ?? between;
    const list = out.get(material);
    if (list) list.push(shape);
    else out.set(material, [shape]);
  }
  return out;
}

/** The ground of the floor at a point: a room's material, a cave's rock; null off the floors (a house's grounds, the rock round a cave). */
export function groundAt(scene: ArtScene): (x: number, y: number) => CrayonGroundId | null {
  const { dungeon } = scene.env;
  if (dungeon.floor.cave) return (x, y) => (dungeon.field.distance(x, y) <= 0 ? 'cave' : null);
  let known: RoomMaterials | null = null;
  return (x, y) => {
    const { rooms, between } = (known ??= roomMaterials(scene));
    for (const [shape, material] of rooms) if (shapeDistance(shape, x, y) <= 0) return material;
    return dungeon.field.distance(x, y) <= 0 ? between : null;
  };
}
