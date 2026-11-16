import type { CampaignPlayer } from './playersFile';
import type { TokenAssignments } from './tokenAssignments';

/** What a campaign's players were given: their characters (library token ids) and single tokens (placed token ids). */
export interface GivenTokens {
  readonly characters: ReadonlySet<string>;
  readonly tokens: ReadonlySet<string>;
}

/** What the `players` of a campaign were given; a token whose owner is no player of it was given to nobody. */
export function givenTokens(players: readonly CampaignPlayer[], assignments: TokenAssignments): GivenTokens {
  const ids = new Set(players.map((player) => player.id));
  return {
    characters: new Set(players.flatMap((player) => player.characters)),
    tokens: new Set(Object.entries(assignments.owners).flatMap(([tokenId, owner]) => (ids.has(owner) ? [tokenId] : []))),
  };
}
