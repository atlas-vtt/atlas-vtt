import { everyLevelObjects } from '../../levels/levelObjects';
import { hasLevels, levelById, resolveLevel } from '../../levels/sceneLevels';
import { levelLabel } from '../../react/components/levels/levelEditing';
import { mapTokens } from '../../tokens/offMap';
import type { TokenEntity } from '../../types';
import { MAX_FLOOR_NAME, type SharedFloor } from '../protocol/index.ts';
import type { SceneState } from './atlasView.ts';

/** A floor of the shared scene, by its level id; null is the first floor, and a scene without levels' only one. */
export type Floor = string | null;

/** What decides on which floor each player stands. */
export interface FloorInputs {
  readonly state: Pick<SceneState, 'objects' | 'levels'>;
  /** The owner of a token, by its GM id and the token; undefined for the GM's own. */
  ownerOf(tokenId: string, token: TokenEntity): string | undefined;
  /** The token each player last moved or acted with, by GM id. */
  readonly acting: ReadonlyMap<string, string>;
  /** The floor Atlas presents to its player view (the eye): where players without a token on the map stand. */
  readonly presented: Floor;
}

/** The floors players stand on by their tokens, as their owners' sets of floors. */
function floorsByOwner(inputs: FloorInputs): Map<string, Map<string, Floor>> {
  const { state } = inputs;
  const owned = new Map<string, Map<string, Floor>>();
  for (const [id, token] of Object.entries(mapTokens(everyLevelObjects(state)))) {
    // A hidden token is not shown to its player: it takes them nowhere.
    if (token.isHidden === true) continue;
    const owner = inputs.ownerOf(id, token);
    if (owner === undefined) continue;
    let places = owned.get(owner);
    if (places === undefined) owned.set(owner, places = new Map<string, Floor>());
    places.set(id, resolveLevel(state.levels, token.level));
  }
  return owned;
}

/**
 * The floor a player with these tokens (GM id → floor) stands on: the one floor all of them stand on;
 * with tokens on several, the floor of the one they last moved or acted with, else the presented floor
 * where one of them stands, else that of the first by id; the presented floor without any.
 */
function floorOf(places: ReadonlyMap<string, Floor> | undefined, acting: string | undefined, presented: Floor): Floor {
  if (places === undefined || places.size === 0) return presented;
  const floors = new Set(places.values());
  if (floors.size === 1) return floors.values().next().value as Floor;
  if (acting !== undefined && places.has(acting)) return places.get(acting)!;
  if (floors.has(presented)) return presented;
  return places.get([...places.keys()].sort()[0]!)!;
}

/** What `playerFloors` worked out: each player's floor, and whether every player of the table stands on the presented floor. */
export interface PlayerFloors {
  /** The floor of each player asked about. */
  readonly floors: ReadonlyMap<string, Floor>;
  /**
   * Whether every player who owns a token of the scene, connected or not, stands on the presented floor,
   * and so every player who may join: only then may that floor go to all at once.
   */
  readonly together: boolean;
}

/**
 * On which floor of the shared scene each of `players` stands: where their own tokens stand (the
 * one they last moved or acted with where they have tokens on several floors), else the presented
 * floor. A scene without levels has one floor, on which everyone stands.
 */
export function playerFloors(inputs: FloorInputs, players: readonly string[]): PlayerFloors {
  if (!hasLevels(inputs.state.levels)) return { floors: new Map(players.map((player) => [player, null])), together: true };
  const presented = resolveLevel(inputs.state.levels, inputs.presented);
  const owned = floorsByOwner(inputs);
  const floor = (player: string): Floor => floorOf(owned.get(player), inputs.acting.get(player), presented);
  return {
    floors: new Map(players.map((player) => [player, floor(player)])),
    together: [...owned.keys()].every((owner) => floor(owner) === presented),
  };
}

/** Floor `floor` of the scene as players are told it, with the map's `group`; none for a scene of one floor or a floor it does not have. */
export function sharedFloor(state: Pick<SceneState, 'levels'>, floor: Floor, group: string): SharedFloor | undefined {
  const { levels } = state;
  const level = levelById(levels, floor);
  if (!hasLevels(levels) || level === null) return undefined;
  return { group, level: levels.indexOf(level), name: [...levelLabel(levels, level)].slice(0, MAX_FLOOR_NAME).join('') };
}
