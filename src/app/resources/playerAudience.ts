import type { PlayerTokenRef } from '../characters/playerTokens';
import { sideOf } from '../initiative/sides';
import type { TokenEntity } from '../types';
import { playerAudience } from './playerAudienceFields';
import type { ResourceDefinition } from './resourceTypes';

export { PLAYER_AUDIENCES, playerAudience, withPlayerAudience, type PlayerAudience } from './playerAudienceFields';

/** What a token is asked for its side: the GM's choice, its vision, whose it is. */
export type SideHolder = Partial<Pick<TokenEntity, 'side' | 'vision'>> & PlayerTokenRef;

/** Whether players at large see the resource on `token`. */
export function shownToPlayersOn(definition: ResourceDefinition, token: SideHolder): boolean {
  const audience = playerAudience(definition);
  if (audience === 'everyone') return true;
  if (audience === 'hidden') return false;
  // The built-in two: a token on a side the collection named counts as one without a side
  const side = sideOf(token);
  return audience === 'party' ? side === 'players' : side === 'opponents';
}
