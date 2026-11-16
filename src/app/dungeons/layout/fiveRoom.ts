/**
 * A five-room dungeon (Johnn Four's structure) as architecture: four main rooms in a row, joined by
 * passages, the last of them the boss room, and a fifth, smaller room beyond it, behind a secret
 * door more often than not. No loops and no secret wings: the stages come in their order.
 */

import type { CompactLayout } from './compact';
import type { DungeonParams, SizeStyle } from '../params';
import type { FiveRoomStage } from '../model';
import { FIVE_ROOM_STAGES } from '../model';
import { dir, perpendicular } from '../geometry';
import { type KeyedRng, chance, shuffled } from '../rng';
import { hops, neighbours } from '../roomGraph';
import { roomFits } from './grow';
import { REGULAR_ZONE, type WorkLayout, type WorkRoom, doorMayOpen, localCell, roomRect } from './workLayout';

/** The main rooms before the reward: entrance, puzzle, setback and the boss room. */
const MAIN_ROOMS = 4;
/** How often the reward lies behind a secret door, by the dungeon's tags. */
function secretReward(tags: ReadonlySet<string>): number {
  if (tags.has('no-secrets')) return 0;
  return tags.has('secret') ? 1 : 0.6;
}

/**
 * The main rooms and the passages between them, by the tags: small and cramped dungeons mix in
 * small rooms, large and spacious ones only large; compact ones set the rooms close, winding ones
 * lead long passages between them.
 */
function fiveRoomSizes(tags: ReadonlySet<string>): SizeStyle[] {
  const rooms: SizeStyle[] = tags.has('small') || tags.has('cramped') ? [0, 1, 1] : tags.has('large') || tags.has('spacious') ? [1, 1, 1, 1] : [1, 1, 1];
  const passages: SizeStyle[] = tags.has('compact') ? [3] : tags.has('winding') ? [2, 2, 2, 3, 3, 3, 3] : [2, 2, 3];
  return [...rooms, ...passages];
}

/**
 * A floor's params for a five-room dungeon: a string of four main rooms with passages between
 * them. Tags that make sense for one string of rooms still apply (sizes, passages, secrets,
 * colonnades); counts of rooms and side wings do not.
 */
export function fiveRoomParams(params: DungeonParams): DungeonParams {
  const { tags } = params;
  return {
    ...params,
    minRooms: MAIN_ROOMS,
    maxRooms: MAIN_ROOMS,
    string: true,
    symmetry: [false],
    sizeStyles: fiveRoomSizes(tags),
    secretWings: { chance: 0, extra: 0 },
    secretLoopChance: 0,
    secretEntranceWeight: 0,
    secretReward: secretReward(tags),
    // Columns along every wall would leave a guard post or a set piece no room; only asked for.
    colonnadeFactor: tags.has('colonnades') ? 1 : 0,
  };
}

const REWARD_SIZES = [
  { width: 5, depth: 4 },
  { width: 5, depth: 5 },
  { width: 7, depth: 4 },
  { width: 5, depth: 6 },
];

/** The ways out of the boss room a reward room may grow through: its far wall's middle, or a side wall's. */
function exitsOf(boss: WorkRoom): { origin: WorkRoom['origin']; axis: WorkRoom['axis'] }[] {
  const half = (boss.width - 1) / 2;
  const side = perpendicular(boss.axis);
  const k = Math.floor((boss.depth - 1) / 2);
  return [
    { origin: localCell(boss, boss.depth - 1, 0), axis: boss.axis },
    { origin: localCell(boss, k, half), axis: side },
    { origin: localCell(boss, k, -half), axis: dir(-side.x, -side.y) },
  ];
}

/** Grows the reward room beyond the boss room; false where the rock leaves no room for it. */
export function addRewardRoom(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams): boolean {
  const boss = layout.rooms.find((room) => room.boss && !room.removed);
  if (!boss) return false;
  const rng = rngOf('reward');
  const secret = chance(rng, params.secretReward);
  for (const exit of shuffled(rng, exitsOf(boss))) {
    const least = (params.minRoomFloor ?? 0) + 2;
    for (const size of shuffled(rng, REWARD_SIZES).filter((size) => size.width >= least && size.depth >= least)) {
      const room: WorkRoom = {
        id: layout.rooms.length,
        ...exit,
        ...size,
        group: boss.group,
        parent: boss.id,
        removed: false,
        wing: secret ? 'secret' : 'regular',
        zone: secret ? REGULAR_ZONE + 1 : REGULAR_ZONE,
        rotunda: false,
        colonnade: false,
        fixed: false,
        boss: false,
      };
      if (!roomFits(layout, roomRect(room), new Set(), false) || !doorMayOpen(layout, exit.origin, exit.axis)) continue;
      layout.rooms.push(room);
      layout.doors.push({ ...exit.origin, dir: exit.axis, kind: secret ? 'secret' : 'door', from: boss.id, to: room.id, loop: false });
      return true;
    }
  }
  return false;
}

/** The stage of each main room: the first three normal rooms on the way in, the boss room, the room beyond it. */
export function withStages(layout: CompactLayout): CompactLayout {
  const boss = layout.rooms.find((room) => room.boss);
  const distance = hops(neighbours(layout.rooms.length, layout.doors), 0);
  const stageOf = new Map<number, FiveRoomStage>();
  if (boss) {
    stageOf.set(boss.id, 'climax');
    const reward = layout.rooms.find((room) => room.parent === boss.id && room.kind === 'room');
    if (reward) stageOf.set(reward.id, 'reward');
  }
  const before = layout.rooms
    .filter((room) => room.kind === 'room' && !stageOf.has(room.id))
    .sort((a, b) => (distance[a.id] ?? Infinity) - (distance[b.id] ?? Infinity) || a.id - b.id)
    .slice(0, 3);
  before.forEach((room, k) => stageOf.set(room.id, FIVE_ROOM_STAGES[k] as FiveRoomStage));
  return {
    ...layout,
    rooms: layout.rooms.map((room) => {
      const stage = stageOf.get(room.id);
      return stage ? { ...room, stage } : room;
    }),
  };
}
