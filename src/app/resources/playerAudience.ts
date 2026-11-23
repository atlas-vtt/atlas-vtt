import type { PlayerTokenRef } from '../characters/playerTokens';
import { sideOf } from '../initiative/sides';
import type { TokenEntity } from '../types';
import type { ResourceDefinition } from './resourceTypes';

/**
 * Whose tokens players see a resource on: none, the party's (`sideOf` says `players`), everyone
 * else's (the opponents', NPCs without a side among them), or every token.
 */
export type PlayerAudience = 'hidden' | 'party' | 'opponents' | 'everyone';

/** In the order the controls offer them, from hidden to all. */
export const PLAYER_AUDIENCES: readonly PlayerAudience[] = ['hidden', 'party', 'opponents', 'everyone'];

/** What a token is asked for its side: the GM's choice, its vision, whose it is. */
export type SideHolder = Partial<Pick<TokenEntity, 'side' | 'vision'>> & PlayerTokenRef;

/**
 * Whose tokens players see the resource on. `visibleOnSide` narrows it to one side and is stored
 * only beside `visibleToPlayers: false`, so an Atlas that knows only `visibleToPlayers` hides such
 * a resource rather than showing it on every token.
 */
export function playerAudience(definition: Pick<ResourceDefinition, 'visibleToPlayers' | 'visibleOnSide'>): PlayerAudience {
  if (definition.visibleOnSide === 'players') return 'party';
  if (definition.visibleOnSide === 'opponents') return 'opponents';
  return definition.visibleToPlayers ? 'everyone' : 'hidden';
}

/** `definition` shown to `audience`, with the stored fields as `playerAudience` reads them. */
export function withPlayerAudience(definition: ResourceDefinition, audience: PlayerAudience): ResourceDefinition {
  const { visibleOnSide: _dropped, ...rest } = definition;
  if (audience === 'party') return { ...rest, visibleToPlayers: false, visibleOnSide: 'players' };
  if (audience === 'opponents') return { ...rest, visibleToPlayers: false, visibleOnSide: 'opponents' };
  return { ...rest, visibleToPlayers: audience === 'everyone' };
}

/** Whether players at large see the resource on `token`. */
export function shownToPlayersOn(definition: ResourceDefinition, token: SideHolder): boolean {
  const audience = playerAudience(definition);
  if (audience === 'everyone') return true;
  if (audience === 'hidden') return false;
  // The built-in two: a token on a side the collection named counts as one without a side
  const side = sideOf(token);
  return audience === 'party' ? side === 'players' : side === 'opponents';
}
