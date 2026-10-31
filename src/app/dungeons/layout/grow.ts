/**
 * Grows a floor's room tree breadth first from its first room: the room behind the entrance, or
 * on every later floor the room around the landing of the stairs from the floor before. Every queued room
 * draws from a stream of its own seed, so two rooms queued with one seed grow the same subtree.
 */

import type { CellDir, CellPoint } from '../model';
import type { DungeonParams } from '../params';
import { type CellRect, contains, dir, rectsClash, rectsTouch } from '../geometry';
import type { KeyedRng, Rng } from '../rng';
import { type Branch, type CaveBranching, branchesOf } from './branches';
import { type CaveExit, type WayRoll, onlyCrawlsOn, rollExits, verticalExits } from './cavern/veins/caveExits';
import { GARGANTUAN_FLOOR_ROOMS, type TierDraw } from './cavern/veins/caveSizes';
import { RoomIndex } from './roomIndex';
import { type RoomSize, drawDoorKind, drawSize, routePassage } from './sizes';
import { chainedBranches } from './cavern/veins/routeChain';
import { REGULAR_ZONE, type WorkLayout, type WorkRoom, doorMayOpen, isNormal, rectPastMouth, roomAt, roomRect } from './workLayout';

/** Corridors do not count towards size; this keeps a corridor maze from growing forever. */
const MAX_TOTAL_ROOMS = 400;
const NONE: ReadonlySet<number> = new Set();

/** Where a floor's first room stands, and on a floor below the entry its size, fixed by the landing. */
export interface FloorRoot {
  origin: CellPoint;
  axis: CellDir;
  seed: number;
  /** The room holds the landing of the stairs from above: no door leads in, and it keeps this size. */
  landing?: RoomSize;
  /** The least depth of the first room, walls included, where it is a normal room: a gate passage long enough to hold murder holes. */
  minDepth?: number;
}

interface QueuedRoom {
  parent: number | null;
  origin: CellPoint;
  axis: CellDir;
  flip: boolean;
  seed: number;
  group: number;
  fallbacks: Branch[];
  /** In a cave, the exit the room is entered by. */
  exit?: WayRoll;
  /** In a cave, the passages of a long way still to lay, this room's first: it is a passage that long. */
  route?: readonly number[];
}

/**
 * How far past a cave's mouth door a room's walls may reach, the way the mouth faces: its floor no
 * further out than the door's line, so the floor shaped round it (a cell of swell) reaches the
 * ground's line at most and a passage along it keeps its winding room there (`holdPastMouths`).
 */
const MOUTH_WALL_REACH = 1;

/**
 * Whether a room of this shape may stand here: walls may be shared, floors never, the reserved
 * ground stays clear, and in a cave no floor lies further out than the mouth's door
 * (`WorkLayout.mouth`). `index`, where given, holds every room of the layout as it stands (while
 * the tree grows), and is asked instead of each room.
 */
export function roomFits(layout: WorkLayout, rect: CellRect, ignore: ReadonlySet<number>, first: boolean, index?: RoomIndex): boolean {
  if (!first && layout.reserved && rectsTouch(rect, layout.reserved)) return false;
  if (!first && layout.mouth && rectPastMouth(layout.mouth, rect) > MOUTH_WALL_REACH) return false;
  if (layout.within && !contains(layout.within, rect)) return false;
  if (index) return !index.clashes(rect, ignore);
  return layout.rooms.every((room) => room.removed || ignore.has(room.id) || !rectsClash(rect, roomRect(room)));
}

export function normalCount(layout: WorkLayout): number {
  return layout.rooms.filter((room) => !room.removed && isNormal(room)).length;
}

function newRoom(layout: WorkLayout, item: QueuedRoom, size: RoomSize, fixed: boolean): WorkRoom {
  return {
    id: layout.rooms.length,
    origin: item.origin,
    axis: item.axis,
    width: size.width,
    depth: size.depth,
    group: item.group,
    parent: item.parent,
    removed: false,
    wing: 'regular',
    zone: REGULAR_ZONE,
    rotunda: false,
    colonnade: false,
    fixed,
    boss: false,
    ...(size.passage && { passage: size.passage }),
    ...(size.tier && { tier: size.tier }),
  };
}

/** The nearest chamber's tier on the way back from `id`: the size a chamber reached from it leans away from. */
function tierBefore(layout: WorkLayout, id: number | null): WorkRoom['tier'] {
  for (let at = id; at !== null; at = roomAt(layout, at).parent) {
    const room = roomAt(layout, at);
    if (isNormal(room)) return room.tier;
  }
  return undefined;
}

/**
 * What a cave chamber's tier draw may be, where it would stand: one gargantuan cave a floor, leaning
 * as the cave's character says. A lived-in cave's mouth opens into a chamber, never a passage: its
 * dwellers keep their hollows by the mouth, and a long passage there would leave them none.
 */
function tierDraw(layout: WorkLayout, params: DungeonParams, item: QueuedRoom): TierDraw {
  const rules = params.cave?.veins?.rules;
  const away = rules?.leanAway ? tierBefore(layout, item.parent) : undefined;
  const opens = rules?.opensPastSqueeze === true && (item.exit?.way === 'squeeze' || item.exit?.way === 'letterbox');
  const gargantuan = params.maxRooms >= GARGANTUAN_FLOOR_ROOMS && !layout.rooms.some((room) => !room.removed && room.tier === 'gargantuan');
  const mouth = item.parent === null && params.tags.has('inhabited');
  return { gargantuan, ...(away && { awayFrom: away }), ...(opens && { opens }), ...(mouth && { chamber: true }) };
}

/**
 * The way a passage runs on through its far door: the way it was entered by. A double's special
 * way (a sump, a traverse) is one stretch of the route, so it crosses only the passage a chamber's
 * exit opens into; a passage past that one is passed as it comes.
 */
function wayThrough(layout: WorkLayout, room: WorkRoom, item: QueuedRoom): WayRoll | undefined {
  if (isNormal(room) || !item.exit) return undefined;
  const fromChamber = item.parent !== null && isNormal(roomAt(layout, item.parent));
  return item.exit.special && !fromChamber ? undefined : item.exit;
}

/**
 * A cave's branching for a placed room: a chamber rolls its exits (and keeps those in its roof and
 * floor, their depths from a stream of the room's own, so the room's own stream runs on as before
 * ways up and down had depths), a passage runs on the way it was entered.
 */
function caveBranching(rng: Rng, depths: Rng, params: DungeonParams, layout: WorkLayout, room: WorkRoom, item: QueuedRoom): CaveBranching | undefined {
  const rules = params.cave?.veins?.rules;
  if (!rules) return undefined;
  const exits: CaveExit[] | null = isNormal(room) ? rollExits(rng, rules.exits, depths) : null;
  const vertical = exits && verticalExits(exits);
  if (vertical) room.vertical = vertical;
  if (exits && onlyCrawlsOn(exits)) room.tight = true;
  const through = wayThrough(layout, room, item);
  return { exits, passageSides: rules.passageSides, ...(through && { through }), ...(rules.oneWayOn && { oneWayOn: true }) };
}

/**
 * The branches of a placed room; a cave passage with more of its way to lay (`route`) leads on to
 * the next passage first, its draws from a stream of its own, so every other room's are as before.
 */
function roomBranches(rng: Rng, rngOf: KeyedRng, params: DungeonParams, layout: WorkLayout, room: WorkRoom, item: QueuedRoom, route: readonly number[]): Branch[][] {
  const groups = branchesOf(rng, room, item.flip, params, caveBranching(rng, rngOf(`depths:${item.seed}`), params, layout, room, item));
  const rules = params.cave?.veins?.rules;
  return rules && route.length > 0 && !isNormal(room) ? chainedBranches(rngOf(`route:${item.seed}`), room, item.flip, groups, route, rules.exits) : groups;
}

/**
 * The tree grown from `root` until the params' most rooms. On the entry floor (`reserved` set) the
 * first room is entered by an opening from the outside at its origin; a landing has no way in.
 */
export function growTree(rngOf: KeyedRng, params: DungeonParams, root: FloorRoot, base: Pick<WorkLayout, 'reserved' | 'within' | 'blocked'>): WorkLayout {
  const layout: WorkLayout = { rooms: [], doors: [], ...base, ...(params.cave?.veins && { tiered: true as const }) };
  const queue: QueuedRoom[] = [{ parent: null, origin: root.origin, axis: root.axis, flip: false, seed: root.seed, group: 0, fallbacks: [] }];
  let groups = 1;
  let normals = 0;
  const index = new RoomIndex();
  for (let head = 0; head < queue.length; head++) {
    if (normals >= params.maxRooms || layout.rooms.length >= MAX_TOTAL_ROOMS) break;
    const item = queue[head] as QueuedRoom;
    const first = item.parent === null;
    const rng = rngOf(item.seed);
    const drawn = first && root.landing ? root.landing : item.route ? routePassage(item.route[0]!) : drawSize(rng, params, params.cave?.veins && tierDraw(layout, params, item));
    const size = first && root.minDepth !== undefined && isNormal(drawn) ? { ...drawn, depth: Math.max(drawn.depth, root.minDepth) } : drawn;
    const room = newRoom(layout, item, size, first && root.landing !== undefined);
    const rect = roomRect(room);
    const fits = first || (roomFits(layout, rect, NONE, false, index) && doorMayOpen(layout, item.origin, item.axis));
    if (!fits) {
      const [next, ...rest] = item.fallbacks;
      if (next) queue.push({ ...next, fallbacks: rest, parent: item.parent, group: item.group });
      continue;
    }
    layout.rooms.push(room);
    index.add(room.id, rect);
    if (item.parent !== null) {
      const parent = roomAt(layout, item.parent);
      const way = item.exit && { way: item.exit.way, width: item.exit.width };
      layout.doors.push({ x: item.origin.x, y: item.origin.y, dir: item.axis, kind: drawDoorKind(rng, !isNormal(parent) && !isNormal(room)), from: item.parent, to: room.id, loop: false, ...way });
    } else if (!root.landing) {
      layout.doors.push({ x: item.origin.x, y: item.origin.y, dir: item.axis, kind: 'opening', from: null, to: room.id, loop: false });
      if (params.cave?.veins) layout.mouth = { origin: item.origin, out: dir(-item.axis.x, -item.axis.y) };
    }
    if (isNormal(room)) normals++;
    for (const group of roomBranches(rng, rngOf, params, layout, room, item, item.route ? item.route.slice(1) : (drawn.route ?? []))) {
      const id = groups++;
      group.forEach((branch) => queue.push({ ...branch, parent: room.id, group: id }));
    }
  }
  return layout;
}
