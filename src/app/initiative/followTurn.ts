import type { Viewport } from 'pixi-viewport';
import { panToToken } from '../pixi/tokenFocus';
import type { ResourceDefinition } from '../resources/resourceTypes';
import type { TokenEntity } from '../types';
import type { InitiativeState } from '../types/initiativeTypes';
import { isOffMap } from '../tokens/offMap';
import { turnHolders } from './turnHolders';

/** What following the turn reads of a view. */
export interface FollowState {
  readonly initiative: Pick<InitiativeState, 'isActive' | 'round' | 'entries' | 'sides'>;
  readonly objects: { readonly tokens: Readonly<Record<string, TokenEntity>> };
  readonly grid?: { readonly size?: number } | null | undefined;
}

/**
 * The token the GM's view follows to: the first that holds the turn (by sides the first of the
 * side's combatants in the tracker's order that the map's `resources` do not call defeated) and that the canvas shows. None for a combatant
 * beside the map, or one the canvas leaves out (the players' view, out of their sight).
 */
export function followedToken(state: FollowState, canvasShows: (tokenId: string) => boolean, resources: readonly ResourceDefinition[]): TokenEntity | null {
  for (const tokenId of turnHolders(state.initiative, state.objects.tokens, resources)) {
    const token = state.objects.tokens[tokenId];
    if (token && !isOffMap(token) && canvasShows(tokenId)) return token;
  }
  return null;
}

/**
 * Brings the token whose turn begins to the middle of the GM's view, at the GM's zoom (`panToToken`),
 * first showing its floor (`showLevel`) where it stands on another.
 */
export function followTurn(
  viewport: Viewport | null | undefined,
  state: FollowState,
  canvasShows: (tokenId: string) => boolean,
  resources: readonly ResourceDefinition[],
  showLevel?: (tokenId: string) => void,
): boolean {
  const token = followedToken(state, canvasShows, resources);
  if (!viewport || !token) return false;
  showLevel?.(token.id);
  panToToken(viewport, token, state.grid?.size ?? 70);
  return true;
}
