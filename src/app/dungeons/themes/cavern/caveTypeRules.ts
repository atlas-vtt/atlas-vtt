/**
 * What a Cavern knows of its rooms beyond their traits, read from its geology (`caveSites`), and
 * which rooms a type may take there: a lake only where water gathers, a gallery along a fault,
 * lava and acid only deep and with their tags, a lived-in cave's hollows near the mouth and water.
 */

import { floorRect, intersection, roomArea } from '../../geometry';
import type { CaveSites } from '../../layout/cavern/caveSites';
import { caveVariant } from '../../layout/cavern/caveParams';
import { nearFault } from '../../layout/cavern/faults';
import type { CaveVariant, DungeonFloor } from '../../model';
import { neighbours } from '../../roomGraph';
import type { DungeonTag } from '../../tags';
import type { RoomTypeId } from '../roomTypes';
import type { RoomRef, ThemeFactsInput } from '../themeTypes';
import { hollowSite, isInhabited } from './inhabited';

export interface CaveFacts {
  sites: CaveSites[];
  variant: CaveVariant;
  inhabited: boolean;
  tags: ReadonlySet<DungeonTag>;
  floors: readonly Pick<DungeonFloor, 'rooms' | 'doors' | 'stairs' | 'cave'>[];
  /** The directions the cave's faults run in. */
  faults: readonly number[];
}

export function caveFacts(input: ThemeFactsInput, sites: readonly CaveSites[]): CaveFacts {
  const faults = [...new Set(input.floors.flatMap((floor) => floor.cave?.faults.map((f) => f.angle) ?? []))];
  return { sites: [...sites], variant: caveVariant(input.tags), inhabited: isInhabited(input.tags, sites), tags: input.tags, floors: input.floors, faults };
}

/** A lava flow or an acid spring needs this much floor: room beside the way through for it and a bank to stand on. */
const MOLTEN_AREA = 16;
/** A chasm hall needs this much: floor on both sides of its chasm and rock left to cross it by. */
const CHASM_AREA = 20;
/** ...and, above another floor, a room below lying under this many of its cells. */
const UNDER_CHASM = 8;

/** The angle the room is longest along, from its rectangle. */
function roomAxis(room: DungeonFloor['rooms'][number]): number {
  return room.w >= room.h ? 0 : Math.PI / 2;
}

/** Whether the room ends a stream, at its low end. */
function streamEnd(facts: CaveFacts, ref: RoomRef): boolean {
  return (facts.floors[ref.floor]?.cave?.streams ?? []).some((s) => s[s.length - 1] === ref.room);
}

/** Whether the room holds the lower end of a pitch: an aven. */
function underPitch(facts: CaveFacts, ref: RoomRef): boolean {
  const floor = facts.floors[ref.floor];
  const room = floor?.rooms[ref.room];
  if (!floor || !room) return false;
  return floor.stairs.some((s) => s.way === 'pitch' && s.to < ref.floor && s.x >= room.x && s.x + s.w <= room.x + room.w && s.y >= room.y && s.y + s.h <= room.y + room.h);
}

/** Whether a chasm in the room has somewhere to open onto: nothing below it, or a room below lying under a good part of it. */
function opensBelow(facts: CaveFacts, ref: RoomRef): boolean {
  const room = facts.floors[ref.floor]?.rooms[ref.room];
  const below = facts.floors[ref.floor + 1];
  if (!room || !below) return true;
  return below.rooms.some((other) => {
    const over = other.kind === 'room' && other.wing === 'regular' ? intersection(floorRect(room), floorRect(other)) : null;
    return over !== null && (over.x1 - over.x0 + 1) * (over.y1 - over.y0 + 1) >= UNDER_CHASM;
  });
}

function doors(facts: CaveFacts, ref: RoomRef): number {
  const floor = facts.floors[ref.floor];
  return floor ? (neighbours(floor.rooms.length, floor.doors)[ref.room]?.length ?? 0) : 0;
}

/** The facts' own rules: where a type may stand beyond its traits. */
export function allowsType(facts: CaveFacts, type: RoomTypeId, ref: RoomRef): boolean {
  const site = facts.sites[ref.floor];
  const floor = facts.floors[ref.floor];
  const room = floor?.rooms[ref.room];
  if (!site || !floor || !room) return true;
  const cave = floor.cave;
  const basin = cave?.basins.includes(ref.room) ?? false;
  // A lived-in cave ends where its chief sleeps.
  if (room.boss && facts.inhabited && type !== 'chief-den') return false;
  switch (type) {
    case 'cave-mouth':
    case 'den':
      return !facts.inhabited;
    case 'guard-post':
    case 'chief-den':
      return facts.inhabited;
    case 'lived-in-hollow':
    case 'fire-hollow':
    case 'pen':
    case 'store-hollow':
      return facts.inhabited && hollowSite(site, ref.room);
    case 'flowstone-gallery':
      return nearFault(roomAxis(room), facts.faults, Math.PI / 6);
    case 'lake-cavern':
      // A dam holds water only in a wet cave: a dry one has none.
      return basin || (room.boss && (cave?.dams.includes(ref.room) ?? false));
    case 'stream-passage':
      return (cave?.streams ?? []).some((s) => s.slice(0, -1).includes(ref.room));
    case 'sump':
      return basin && streamEnd(facts, ref);
    case 'chasm-hall':
      return site.faultOf(ref.room) !== null && roomArea(room) >= CHASM_AREA && opensBelow(facts, ref);
    case 'collapse-chamber':
      return doors(facts, ref) >= 3 || underPitch(facts, ref);
    case 'fungus-grove':
      return site.nearWater(ref.room, 1);
    case 'crystal-grotto':
      return basin || (neighbours(floor.rooms.length, floor.doors)[ref.room] ?? []).some((n) => cave?.basins.includes(n));
    case 'lava-tube':
      return facts.tags.has('lava') && site.deep(ref.room) && roomArea(room) >= MOLTEN_AREA;
    case 'sulphur-spring':
      return facts.tags.has('acid') && site.deep(ref.room) && site.faultOf(ref.room) !== null && roomArea(room) >= MOLTEN_AREA;
    case 'roost':
      return (site.hopsFromMouth[ref.room] ?? Infinity) <= 1;
    default:
      return true;
  }
}
