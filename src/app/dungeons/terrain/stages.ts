/**
 * The five main rooms of a five-room dungeon as architecture (Johnn Four's stages), never monsters,
 * loot or mechanisms that would ask the GM for a story. Each stage has several ways to be built,
 * chosen by weight and the dungeon's tags, so no two dungeons repeat one another: the entrance a
 * guard post, scattered cover, a dais to hold or an empty hall; the second room a set piece of
 * statues, a basin or an obelisk; the setback a hazard, rough ground or a ledge; the
 * climax the boss arena; the reward room a point of interest or nothing at all.
 */

import type { CellDir, FiveRoomStage, TerrainKind } from '../model';
import { dir } from '../geometry';
import { type Rng, chance, int, pick, weighted } from '../rng';
import type { DungeonTag } from '../tags';
import { furnishArena } from './arena';
import { draft } from './catalog';
import { scatterCover, tryShape } from './cover';
import { roughGround } from './difficult';
import { ledgeAlongWall, platformAtFarWall } from './elevation';
import { hazardWeights, placeHazard } from './hazards';
import { anyInterest, placeInterest } from './interest';
import type { RoomCells } from './roomCells';
import { typeAllows } from './typeReasons';
import { withoutItsHazard } from './cavern/unnamedRoom';
import { placeTypeHazard } from './typeHazards';
import { type TypedRoom, furnishTypedRoom } from './typeTerrain';
import type { TerrainWork } from './work';

function negate(d: CellDir): CellDir {
  return dir(-d.x, -d.y);
}

/** What a stage may build: any terrain in an untyped room, only its type's in a typed one, where no setback is a hazard. */
interface StageRules {
  allows: (kind: TerrainKind) => boolean;
  hazards: boolean;
}

/** Tries the ways in order of a weighted draw, the drawn one first; false where none fits. */
function firstThatFits<T extends string>(rng: Rng, ways: readonly (readonly [T, number])[], build: (way: T) => boolean): boolean {
  const open = ways.filter(([, w]) => w > 0);
  if (open.length === 0) return false;
  const first = weighted(rng, open);
  return [first, ...open.map(([way]) => way).filter((way) => way !== first)].some(build);
}

/** A low wall across most of the way in, a passage left at one side, defenders behind it. */
function guardPost(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, rules: StageRules): void {
  const floor = work.floors[k];
  if (!floor) return;
  const longest = Math.max(2, Math.min(4, rc.width - 2));
  const rows = [Math.floor(rc.depth * 0.6), Math.floor(rc.depth * 0.5), rc.depth - 2, Math.floor(rc.depth * 0.4), rc.depth - 1].filter((i, k, all) => i >= 1 && i < rc.depth && all.indexOf(i) === k);
  const left = chance(rng, 0.5);
  const tries = [longest, 3, 2].filter((n, k, all) => n <= longest && all.indexOf(n) === k).flatMap((length) => {
    const sides = [0, rc.width - length, Math.floor((rc.width - length) / 2), 1, rc.width - length - 1].filter((j, k, all) => j >= 0 && j + length <= rc.width && all.indexOf(j) === k);
    return rows.flatMap((i) => (left ? sides : [...sides].reverse()).map((j) => ({ i, j, length })));
  });
  const built = tries.some(({ i, j, length }) => tryShape(floor, rc, { kind: 'low-wall', di: 1, dj: length }, i, j));
  scatterCover(floor, rc, rng, built ? 1 : 2, work.tags, rules.allows);
}

type Entrance = 'guard-post' | 'cover' | 'dais' | 'empty';

/** The way in: held behind a low wall, among scattered cover, from a dais, or an empty hall. */
function entrance(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, rules: StageRules): void {
  const floor = work.floors[k];
  if (!floor) return;
  const ways: (readonly [Entrance, number])[] = [
    ['guard-post', rules.allows('low-wall') ? 3 : 0],
    ['cover', 2],
    ['dais', rc.depth >= 6 && rules.allows('platform') ? 1.5 : 0],
    ['empty', 1],
  ];
  firstThatFits(rng, ways, (way) => {
    switch (way) {
      case 'guard-post':
        guardPost(work, k, rc, rng, rules);
        return true;
      case 'cover':
        return scatterCover(floor, rc, rng, int(rng, 2, 3), work.tags, rules.allows) > 0;
      case 'dais':
        return platformAtFarWall(floor, rc, 1, Math.ceil(rc.width * 0.5), 1) !== null;
      case 'empty':
        return true;
    }
  });
}

type SetPiece = 'statues' | 'basin' | 'obelisk' | 'plain';

/** The second room's set piece, something to look at that does nothing by itself. */
function setPiece(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, rules: StageRules): void {
  const floor = work.floors[k];
  if (!floor) return;
  const room = rc.room.id;
  const { tags } = work;
  const { allows } = rules;
  const ways: (readonly [SetPiece, number])[] = [
    ['statues', allows('mosaic') && allows('statue') ? 2 : 0],
    ['basin', !allows('pool') || !allows('statue') || tags.has('dry') ? 0 : tags.has('wet') || tags.has('flooded') ? 3 : 1.5],
    ['obelisk', allows('obelisk') ? 1.5 : 0],
    ['plain', 1],
  ];
  firstThatFits(rng, ways, (way) => {
    switch (way) {
      case 'statues': {
        if (!placeInterest(floor, rc, rng, 'mosaic')) return false;
        const i = rc.depth - 2;
        for (const j of [1, Math.floor((rc.width - 1) / 2), rc.width - 2]) floor.place(draft('statue', room, rc.block(i, j, 1, 1), { facing: negate(rc.axis) }));
        return true;
      }
      case 'basin': {
        if (!placeInterest(floor, rc, rng, 'pool')) return false;
        const i = Math.floor((rc.depth - 1) / 2);
        for (const j of [0, rc.width - 1]) floor.place(draft('statue', room, rc.block(i, j, 1, 1), { facing: j === 0 ? rc.across : negate(rc.across) }));
        return true;
      }
      case 'obelisk':
        return placeInterest(floor, rc, rng, 'obelisk');
      case 'plain':
        return anyInterest(floor, rc, rng, tags, allows);
    }
  });
}

type Setback = 'hazard' | 'rubble' | 'broken' | 'ledge';

/** Something in the way: a hazard of the dungeon's kind, rough ground, or a ledge to fight from. */
function setback(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, rules: StageRules): void {
  const floor = work.floors[k];
  if (!floor) return;
  const { tags } = work;
  const { allows } = rules;
  const crumbling = tags.has('crumbling');
  const ways: (readonly [Setback, number])[] = [
    ['hazard', rules.hazards ? 4 : 0],
    ['rubble', !allows('rubble-field') ? 0 : crumbling ? 3 : 1],
    ['broken', !allows('broken-floor') ? 0 : crumbling || tags.has('deep') ? 2 : 0.7],
    ['ledge', tags.has('flat') || !allows('ledge') ? 0 : 1],
  ];
  firstThatFits(rng, ways, (way) => {
    switch (way) {
      case 'hazard':
        return placeHazard(work, k, rc, rng, weighted(rng, hazardWeights(tags).filter(([, w]) => w > 0)));
      case 'rubble':
        return roughGround(floor, rc, rng, 'rubble-field');
      case 'broken':
        return roughGround(floor, rc, rng, 'broken-floor');
      case 'ledge':
        return ledgeAlongWall(floor, rc, rng) !== null;
    }
  });
}

/** The room beyond the boss: a point of interest, or now and then nothing but what the GM puts there. */
function reward(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, tags: ReadonlySet<DungeonTag>, rules: StageRules): void {
  const floor = work.floors[k];
  if (!floor || chance(rng, 0.2)) return;
  const kind = pick(rng, ['obelisk', 'mosaic', 'statue'] as const);
  if (!rules.allows(kind) || !placeInterest(floor, rc, rng, kind)) anyInterest(floor, rc, rng, tags, rules.allows);
}

const ANY: StageRules = { allows: () => true, hazards: true };

/**
 * Terrain for a main room of a five-room dungeon; a typed one builds only what its type allows,
 * without a hazard, and is then furnished by its type's recipe.
 */
export function furnishStage(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, stage: FiveRoomStage, tags: ReadonlySet<DungeonTag>, named?: TypedRoom): void {
  // A cave's stage is its room: a chasm hall keeps its chasm, a lake cavern its lake.
  const hazarded = named !== undefined && work.cave !== undefined && placeTypeHazard(work, k, rc, named.spec, work.rng(k, `hazard:${rc.room.id}`));
  if (hazarded) {
    furnishTypedRoom(work, k, rc, named, { hazarded: true });
    return;
  }
  const typed = named && withoutItsHazard(work, rc.room, named);
  const rules = typed ? { allows: (kind: TerrainKind) => typeAllows(typed.spec, kind, work.theme.ruined), hazards: false } : ANY;
  switch (stage) {
    case 'entrance':
      entrance(work, k, rc, rng, rules);
      break;
    case 'puzzle':
      setPiece(work, k, rc, rng, rules);
      break;
    case 'setback':
      setback(work, k, rc, rng, rules);
      break;
    case 'climax':
      furnishArena(work, k, rc, rng, tags);
      return;
    case 'reward':
      reward(work, k, rc, rng, tags, rules);
      break;
  }
  if (typed) furnishTypedRoom(work, k, rc, typed);
}
