/**
 * One floor's rooms and doors, the passes in the order each needs the ones before it. A floor that
 * misses a rule (too few rooms, no loop on its main way, no room for a second entrance or the
 * stairwells it needs) is grown anew from another start; the attempts are seeded, so a seed always gives the same floor.
 */

import type { CellRect } from '../geometry';
import type { DungeonParams } from '../params';
import { type KeyedRng, type Rng, floorStream } from '../rng';
import { addBossDoor, placeBossRoom } from './boss';
import { cleanUp } from './cleanup';
import { type CompactLayout, compactLayout } from './compact';
import { placeEntrances } from './entrances';
import { addRewardRoom, withStages } from './fiveRoom';
import { floorRulesHold } from './floorRules';
import { type FloorRoot, growTree, normalCount } from './grow';
import { growPass } from './growPass';
import { addLoops, addSecretLoops } from './loops';
import { shapeRooms } from './roomShapes';
import { placeSecretWings } from './secrets';
import { addSteps } from './steps';
import { fitPassages } from './passageWidths';

const MAX_ATTEMPTS = 120;
/** A cave's floor must also fit its chambers' blocks and a lane two cells wide, so it may take more attempts. */
const MAX_CAVE_ATTEMPTS = 600;

export interface FloorRequest {
  /** 0 is the entry floor. */
  floor: number;
  params: DungeonParams;
  /** Where an attempt's first room stands; null when this attempt finds no place for it. */
  rootOf: (rng: Rng) => FloorRoot | null;
  /** The ground before the entrance, on the entry floor. */
  reserved: CellRect | null;
  /** Where every room must lie, or null for anywhere. */
  within: CellRect | null;
  /** Cells no door may open onto: the landing of the stairs from above. */
  blocked: ReadonlySet<string>;
  /** Whether the floor has the boss room. */
  boss: boolean;
  /**
   * Where a gallery could look down into the boss room: the floors of the rooms above. A boss
   * room under one of them is preferred, so it can be two floors high.
   */
  galleries?: readonly CellRect[];
  /** A five-room dungeon: no loops or secret wings, a reward room beyond the boss room, stages named. */
  fiveRoom?: boolean;
  /** Floors that keep every rule passed over before one is taken, the last found where fewer come: a floor grown anew. */
  passOver?: number;
  /** What else the finished floor must allow: the stairwells it needs to and from the floors beside it. */
  accept: (layout: CompactLayout) => boolean;
}

interface Built {
  layout: CompactLayout;
  normals: number;
  /** Keeps the rules between floors, which no fallback may break; asked only where it decides something (null: not yet). */
  linked: boolean | null;
  /** How many of the floor's own rules it keeps: its fewest rooms, its entrances, its boss room, its loop. */
  kept: number;
}

const FLOOR_RULES = 4;

/** The rules between floors are asked only of an attempt that keeps its own, or when choosing a fallback. */
function linked(built: Built, request: FloorRequest): boolean {
  built.linked ??= request.accept(built.layout);
  return built.linked;
}

/**
 * The fallback where no attempt keeps every rule: of those that keep the rules between floors the
 * one keeping most of its own (then with the most rooms, then the first), else the same of all.
 */
function fallback(built: readonly Built[], request: FloorRequest): Built | null {
  const ranked = [...built].sort((a, b) => b.kept - a.kept || b.normals - a.normals);
  return ranked.find((b) => linked(b, request)) ?? ranked[0] ?? null;
}

function attempt(seed: number, request: FloorRequest, index: number): Built | null {
  const { floor, params } = request;
  const rngOf: KeyedRng = (key) => floorStream(seed, 'layout', floor, `${index}:${key}`);
  const root = request.rootOf(rngOf('root'));
  if (!root) return null;
  const work = growTree(rngOf, params, root, { reserved: request.reserved, within: request.within, blocked: request.blocked });
  const normals = normalCount(work);
  growPass(rngOf, work);
  const placed = !request.boss || placeBossRoom(work, request.galleries ?? []);
  if (!request.fiveRoom) addLoops(rngOf, work, params);
  addBossDoor(rngOf, work);
  const boss = placed && (!request.fiveRoom || addRewardRoom(rngOf, work, params));
  if (!request.fiveRoom) {
    placeSecretWings(rngOf, work, params);
    addSecretLoops(rngOf, work, params);
  }
  cleanUp(work);
  const entrances = floor > 0 || placeEntrances(rngOf, work, params, !request.fiveRoom);
  addSteps(rngOf, work, params);
  shapeRooms(rngOf, work, params);
  const compacted = compactLayout(work);
  const compact = params.passageFloor ? fitPassages(compacted) : compacted;
  const layout = request.fiveRoom ? withStages(compact) : compact;
  const kept = [normals >= params.minRooms, entrances, boss, floorRulesHold(layout)].filter(Boolean).length;
  return { layout, normals, linked: null, kept };
}

export interface BuiltFloor {
  layout: CompactLayout;
  /** Keeps every rule; a floor that does not is the best attempt there was. */
  sound: boolean;
}

/** The first attempt that keeps every rule (after `passOver` such), else the best of them (`fallback`); null where no attempt found a place for its first room. */
export function buildFloorLayout(seed: number, request: FloorRequest): BuiltFloor | null {
  const tried: Built[] = [];
  let lastSound: Built | null = null;
  let passed = 0;
  const attempts = request.params.cave ? MAX_CAVE_ATTEMPTS : MAX_ATTEMPTS;
  for (let index = 0; index < attempts; index++) {
    const built = attempt(seed, request, index);
    if (!built) continue;
    if (built.kept === FLOOR_RULES && linked(built, request)) {
      if (passed++ === (request.passOver ?? 0)) return { layout: built.layout, sound: true };
      lastSound = built;
    }
    tried.push(built);
  }
  if (lastSound) return { layout: lastSound.layout, sound: true };
  const best = fallback(tried, request);
  return best ? { layout: best.layout, sound: false } : null;
}
