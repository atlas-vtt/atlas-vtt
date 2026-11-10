/**
 * The tokens a campaign's players file (`playersFile.ts`) assigns beside its players:
 * `tokenOwners` (`{ <token id>: <player id> }`, for tokens placed from no library token; a
 * character's owner is the player whose `characters` list it) and `playerTokens`
 * (`{ <map path>: { <token id>: boolean } }`, true for a token the GM made a player token, false for
 * the GM's own). They are the campaign's, so every device that syncs the vault reads them.
 */

import { PLAYER_ID_PATTERN } from '../../online/protocol/index';
import { isRecord } from '../campaignValues';
import { isWritable, type StoredPlayers } from './playersFile';

/** The tokens a campaign assigns: owners of tokens placed from no library token, and the GM's marks per scene. */
export interface TokenAssignments {
  /** The owner of each token placed from no library token, by token id. */
  readonly owners: Readonly<Record<string, string>>;
  /**
   * Per scene (its map path), the tokens the GM made player tokens (true) or the GM's own (false);
   * every other token is a player token when it is on the players' side.
   */
  readonly playerTokens: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
}

export const NO_ASSIGNMENTS: TokenAssignments = { owners: {}, playerTokens: {} };

const MAX_TOKEN_ID = 200;
const MAX_MAP_PATH = 1000;

/** Assignments read from stored fields: owners with a valid player id, and marks; what cannot be read is left out. */
export function assignmentsFrom(owners: unknown, marks: unknown): TokenAssignments {
  const playerTokens: Record<string, Record<string, boolean>> = {};
  for (const [mapPath, scene] of Object.entries(isRecord(marks) ? marks : {})) {
    if (mapPath.length > MAX_MAP_PATH || !isRecord(scene)) continue;
    const kept = Object.entries(scene).filter((entry): entry is [string, boolean] => entry[0].length <= MAX_TOKEN_ID && typeof entry[1] === 'boolean');
    if (kept.length > 0) playerTokens[mapPath] = Object.fromEntries(kept);
  }
  const owned = Object.entries(isRecord(owners) ? owners : {})
    .filter((entry): entry is [string, string] => entry[0].length <= MAX_TOKEN_ID && typeof entry[1] === 'string' && PLAYER_ID_PATTERN.test(entry[1]));
  return { owners: Object.fromEntries(owned), playerTokens };
}

const read = new WeakMap<StoredPlayers, TokenAssignments>();

/** The assignments a players file holds; the same object while the file is. */
export function readTokenAssignments(stored: StoredPlayers): TokenAssignments {
  let assignments = read.get(stored);
  if (assignments === undefined) {
    assignments = assignmentsFrom(stored.tokenOwners, stored.playerTokens);
    read.set(stored, assignments);
  }
  return assignments;
}

/** The file with its fields set to `assignments`; an empty field is left out. */
function withAssignments(stored: StoredPlayers, { owners, playerTokens }: TokenAssignments): StoredPlayers {
  const { tokenOwners: _owners, playerTokens: _marks, ...rest } = stored;
  return {
    ...rest,
    ...(Object.keys(owners).length > 0 && { tokenOwners: owners }),
    ...(Object.keys(playerTokens).length > 0 && { playerTokens }),
  };
}

/** The file with the tokens `tokenIds` given to `playerId`, or to nobody for null. */
export function withTokenOwners(stored: StoredPlayers, tokenIds: readonly string[], playerId: string | null): StoredPlayers {
  if (!isWritable(stored)) return stored;
  const current = readTokenAssignments(stored);
  const owners: Record<string, string> = { ...current.owners };
  for (const tokenId of tokenIds) {
    if (playerId === null) delete owners[tokenId];
    else if (tokenId.length <= MAX_TOKEN_ID) owners[tokenId] = playerId;
  }
  return withAssignments(stored, { ...current, owners });
}

/** The file with the tokens `tokenIds` of the scene at `mapPath` made player tokens, or the GM's own (false). */
export function withPlayerTokens(stored: StoredPlayers, mapPath: string, tokenIds: readonly string[], player: boolean): StoredPlayers {
  if (!isWritable(stored) || mapPath.length > MAX_MAP_PATH) return stored;
  const current = readTokenAssignments(stored);
  const marked = tokenIds.filter((tokenId) => tokenId.length <= MAX_TOKEN_ID);
  if (marked.length === 0) return stored;
  const scene = { ...current.playerTokens[mapPath], ...Object.fromEntries(marked.map((tokenId) => [tokenId, player])) };
  return withAssignments(stored, { ...current, playerTokens: { ...current.playerTokens, [mapPath]: scene } });
}

/** The file with `carried` added where it assigns nothing yet: what the file already assigns stays the file's. */
export function withCarriedAssignments(stored: StoredPlayers, carried: TokenAssignments): StoredPlayers {
  if (!isWritable(stored)) return stored;
  const current = readTokenAssignments(stored);
  const playerTokens: Record<string, Readonly<Record<string, boolean>>> = { ...current.playerTokens };
  for (const [mapPath, marks] of Object.entries(carried.playerTokens)) playerTokens[mapPath] = { ...marks, ...playerTokens[mapPath] };
  return withAssignments(stored, { owners: { ...carried.owners, ...current.owners }, playerTokens });
}

/** Whether `stored` assigns everything `carried` does, as `withCarriedAssignments` leaves it (a value the file had stays). */
export function holdsAssignments(stored: StoredPlayers, carried: TokenAssignments): boolean {
  const { owners, playerTokens } = readTokenAssignments(stored);
  return Object.keys(carried.owners).every((tokenId) => tokenId in owners)
    && Object.entries(carried.playerTokens).every(([mapPath, marks]) => Object.keys(marks).every((tokenId) => playerTokens[mapPath]?.[tokenId] !== undefined));
}
