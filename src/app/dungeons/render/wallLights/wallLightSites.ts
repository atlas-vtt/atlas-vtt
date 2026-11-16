import { cellKey, floorCellsOf, holdsCell, holdsStairs, roomArea } from '../../geometry';
import type { DungeonProp, DungeonRoom } from '../../model';
import { chance, floorStream, pick, type Rng } from '../../rng';
import { fireSites, firesLit, type FireSite } from '../fireSites';
import { rotate, type Vec } from '../geometry';
import { propsAsDrawn } from '../propsAsDrawn';
import type { VisibleDungeon } from '../visibleDungeon';
import { FIRE_ROOM_CHANCE, lightRank, lightRole, litChance, PASSAGE, roomLightTarget, SHORT_PASSAGE, type LightRole } from './wallLightRooms';
import { alongPassage, besideADoor, besideStairs, farFrom, flankingDais, flankingDoor, nearAWayIn } from './wallLightPicks';
import { FLAME, type WallLightKind } from './wallLightShapes';
import { WallSlots, type WallSlot } from './wallSlots';

/**
 * The lights the people of a lived-in dungeon (`firesLit`) hang on its walls: a Fortress's torches
 * in iron brackets, a Haunted Mansion's candle sconces, torches wedged into a cave's rock, and a
 * brazier on the floor of a cave chamber no wall of which suits, or whose walls stand far from its middle. Worked out from the floor as drawn,
 * after everything on it, from a stream of their own (`lights`, one per room), so they move nothing
 * else and the same floor always has the same lights. Where nobody lives there are none.
 */

export interface WallLight {
  kind: WallLightKind;
  /** The drawing's centre, in cells: `OFF_WALL` off its wall (a brazier: where it stands). */
  x: number;
  y: number;
  /** Radians, 0 with the wall at +y and the room towards −y. */
  rotation: number;
  /** Where the flame burns, in cells: where the scene's light stands. */
  flame: Vec;
  room: number;
}

/** At most this many lights on a floor, so a large dungeon stays cheap to light. */
export const MAX_WALL_LIGHTS = { built: 16, cave: 10 } as const;
/** No two lights nearer than this, in cells (the two of a flanking pair excepted). */
export const LIGHT_SPACING = { built: 4, cave: 5 } as const;
/** The two lights of a flanking pair are at least this far apart. */
const PAIR_SPACING = 1.5;
/** A fireplace lights this far before its mouth, a fire pit this far round; no wall light hangs there, in cells. */
const FIRE_REACH = { fireplace: 6, pit: 5 } as const;
/** A cave chamber of this many floor cells or more may be lit from a brazier in its middle (`BRAZIER_CHANCE`): its walls stand too far off for a torch on one to light it. */
const BRAZIER_AREA = 40;
const BRAZIER_CHANCE = 0.3;
/** How far past the edges of a fireplace's beam its light is still taken to reach, in degrees. */
const BEAM_MARGIN = 15;

interface Floor {
  dungeon: VisibleDungeon;
  cave: boolean;
  kind: WallLightKind;
  slots: WallSlots;
  props: readonly DungeonProp[];
  fires: readonly { site: FireSite; room: number }[];
}

/** Where a slot's flame burns, by the drawing's own `FLAME`. */
function lightAt(slot: WallSlot, kind: WallLightKind): WallLight {
  const f = rotate(FLAME[kind], slot.place.rotation);
  return { kind, ...slot.place, flame: { x: slot.place.x + f.x, y: slot.place.y + f.y }, room: slot.room };
}

/** Whether a fire already lights the point: before a fireplace's mouth, or round a fire pit. */
function inFireLight(p: Vec, fires: Floor['fires']): boolean {
  return fires.some(({ site }) => {
    const d = Math.hypot(p.x - site.at.x, p.y - site.at.y);
    if (!site.opening) return d <= FIRE_REACH.pit;
    if (d > FIRE_REACH.fireplace) return false;
    const facing = { x: Math.sin(site.opening.rotation), y: -Math.cos(site.opening.rotation) };
    const cos = ((p.x - site.at.x) * facing.x + (p.y - site.at.y) * facing.y) / Math.max(d, 1e-9);
    return Math.acos(Math.max(-1, Math.min(1, cos))) <= ((site.opening.angle / 2 + BEAM_MARGIN) * Math.PI) / 180;
  });
}

/** A brazier in a cave chamber whose walls take no torch: on a free cell inside it, all its neighbours floor, as near its middle as there is room. */
function brazier(floor: Floor, room: DungeonRoom, rng: Rng): WallLight[] {
  const cells = floorCellsOf(room);
  const water = new Set(floor.dungeon.floor.waterCells.map(c => cellKey(c.x, c.y)));
  const free = cells.filter(c => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => {
    const n = { x: c.x + dx!, y: c.y + dy! };
    return holdsCell(room, n.x, n.y) && floor.slots.freeCell(n) && !water.has(cellKey(n.x, n.y));
  }) && floor.slots.clearOfPieces({ x: c.x + 0.5, y: c.y + 0.5 }, 0.6) && !inFireLight({ x: c.x + 0.5, y: c.y + 0.5 }, floor.fires));
  if (free.length === 0) return [];
  const mid = cells.reduce((m, c) => ({ x: m.x + (c.x + 0.5) / cells.length, y: m.y + (c.y + 0.5) / cells.length }), { x: 0, y: 0 });
  const near = [...free].sort((a, b) => Math.hypot(a.x + 0.5 - mid.x, a.y + 0.5 - mid.y) - Math.hypot(b.x + 0.5 - mid.x, b.y + 0.5 - mid.y)).slice(0, 3);
  const c = pick(rng, near);
  const at = { x: c.x + 0.5, y: c.y + 0.5 };
  return [{ kind: 'brazier', ...at, rotation: rng() * Math.PI * 2, flame: at, room: room.id }];
}

/** The groups of lights a room asks for, each hung whole or not at all: a flanking pair is a group. */
function roomLights(floor: Floor, room: DungeonRoom, role: LightRole, rng: Rng): WallLight[][] {
  const { dungeon, cave, kind } = floor;
  const all = floor.slots.of(room);
  const slots = all.filter(slot => !inFireLight(lightAt(slot, kind).flame, floor.fires));
  const groups: WallSlot[][] = [];
  const hung = (): Vec[] => groups.flat().map(s => s.place);
  if (role === 'passage') {
    const rules = PASSAGE[cave ? 'cave' : 'built'];
    const long = Math.max(room.w, room.h) >= SHORT_PASSAGE;
    if (long) groups.push(...alongPassage(slots, room, rng, rules.first, rules.gap, rules.chance));
    else if (chance(rng, rules.short)) groups.push(farFrom(slots, [], rng, 1));
  } else {
    const fire = floor.fires.some(f => f.room === room.id);
    const stairs = holdsStairs(room, dungeon.floor.stairs);
    if (chance(rng, fire ? FIRE_ROOM_CHANCE : litChance(room, role, cave))) {
      // A cave chamber whose walls stand far from its middle is lit from a brazier there, now and then.
      if (cave && !fire && role !== 'junction' && (all.length === 0 || (roomArea(room) >= BRAZIER_AREA && chance(rng, BRAZIER_CHANCE)))) {
        const brazierHere = brazier(floor, room, rng);
        if (brazierHere.length > 0 || all.length === 0) return [brazierHere];
      }
      const dais = floor.props.find(prop => prop.kind === 'dais' && prop.room === room.id);
      const first = fire ? farFrom(slots, floor.fires.map(f => f.site.at), rng)
        : role === 'junction' ? farFrom(slots, [], rng, 1)
        : cave ? (chance(rng, 0.55) ? nearAWayIn(slots, room, dungeon.doors, rng) : [])
        : role === 'hall' && dais && chance(rng, 0.75) ? flankingDais(slots, dais)
        : role === 'hall' && chance(rng, 0.65) ? flankingDoor(slots, room, dungeon.doors)
        : chance(rng, 0.65) ? besideADoor(slots, room, dungeon.doors, rng) : [];
      groups.push(first.length > 0 ? first : farFrom(slots, [], rng, 1));
      const target = fire || role === 'junction' ? 1 : roomLightTarget(roomArea(room), role, cave);
      for (let extra = hung().length; extra < target; extra++) if (chance(rng, cave ? 0.35 : 0.6)) groups.push(farFrom(slots, hung(), rng));
    }
    // A stairwell is lit where people come and go by it, whether the room is or not.
    if (stairs && !fire && chance(rng, room.type === 'landing' ? 0.85 : 0.7)) groups.push(besideStairs(slots, room, dungeon.floor.stairs, rng));
  }
  return groups.filter(group => group.length > 0).map(group => group.map(slot => lightAt(slot, kind)));
}

/** Whether `light` keeps its distance from every light already hung. */
function spaced(light: WallLight, hung: readonly WallLight[], spacing: number): boolean {
  return hung.every(other => Math.hypot(other.flame.x - light.flame.x, other.flame.y - light.flame.y) >= spacing);
}

const placed = new WeakMap<VisibleDungeon, readonly WallLight[]>();

/** The wall lights of a floor as drawn, worked out once per floor shown; none where nobody lives. */
export function wallLightsOf(dungeon: VisibleDungeon): readonly WallLight[] {
  let lights = placed.get(dungeon);
  if (!lights) {
    lights = firesLit(dungeon.model) ? hang(dungeon) : [];
    placed.set(dungeon, lights);
  }
  return lights;
}

function hang(dungeon: VisibleDungeon): WallLight[] {
  const cave = dungeon.floor.cave !== undefined;
  const house = dungeon.floor.walls === 'edges';
  const props = propsAsDrawn(dungeon).filter(prop => dungeon.roomShapes.has(prop.room));
  const burning = props.filter(prop => prop.kind === 'hearth' || prop.kind === 'campfire');
  const fires = fireSites(burning, house).map((site, k) => ({ site, room: burning[k]!.room }));
  const floor: Floor = { dungeon, cave, kind: cave ? 'cave-torch' : house ? 'sconce' : 'bracket', slots: new WallSlots(dungeon, props), props, fires };
  const which = cave ? 'cave' : 'built';
  const rooms = dungeon.rooms
    .map(room => ({ room, role: lightRole(room) }))
    .sort((a, b) => lightRank(a.role, holdsStairs(a.room, dungeon.floor.stairs)) - lightRank(b.role, holdsStairs(b.room, dungeon.floor.stairs)) || a.room.id - b.room.id);
  const hung: WallLight[] = [];
  for (const { room, role } of rooms) {
    for (const group of roomLights(floor, room, role, floorStream(dungeon.model.seed, 'lights', dungeon.index, room.id))) {
      if (hung.length + group.length > MAX_WALL_LIGHTS[which]) return hung;
      const [a, b] = group;
      if (a && b && Math.hypot(a.flame.x - b.flame.x, a.flame.y - b.flame.y) < PAIR_SPACING) continue;
      if (group.every(light => spaced(light, hung, LIGHT_SPACING[which]))) hung.push(...group);
    }
  }
  return hung;
}
