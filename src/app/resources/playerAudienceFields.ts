import type { ResourceDefinition } from './resourceTypes';

/**
 * Whose tokens players see a resource on: none, the party's (`sideOf` says `players`), everyone
 * else's (the opponents', NPCs without a side among them), or every token.
 */
export type PlayerAudience = 'hidden' | 'party' | 'opponents' | 'everyone';

/** In the order the controls offer them, from hidden to all. */
export const PLAYER_AUDIENCES: readonly PlayerAudience[] = ['hidden', 'party', 'opponents', 'everyone'];

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
