/**
 * The player's drag in a remote view, with Atlas's own drag and ruler (`InteractionController`):
 * only the tokens the owner lets the player move drag, one at a time. A drop is reported at the
 * point it snaps to, as the GM's drag would put it (`snapDroppedToken`), and the token goes back
 * to where the scene has it until the owner's next scene moves it.
 */
import type { EventEmitter } from 'events';
import { snapDroppedToken } from '../clipboard/mapObjectPlacement';
import type { ViewAtlasState } from '../storeFactory';
import type { TokenEntity } from '../types';

/** What `InteractionController` emits on the view's event bus when the player drops a token in a remote view. */
export const REMOTE_TOKEN_DROPPED = 'remote-token-dropped';

/** Emitted on the same bus to end a drag in progress: the token goes back and nothing is dropped. */
export const REMOTE_DRAG_CANCEL = 'remote-drag-cancel';

export interface RemoteDrop {
  tokenId: string;
  x: number;
  y: number;
}

/** Whether the player may drag `tokenId`: a remote view, and a token its owner lets them move. */
export function mayDragInRemoteView(state: Pick<ViewAtlasState, 'remoteView'>, tokenId: string): boolean {
  return state.remoteView != null && state.remoteView.movableTokenIds.includes(tokenId);
}

/** Where a token of `token`'s size dropped at `point` lands in the remote view's grid. */
export function remoteDropPoint(state: Pick<ViewAtlasState, 'grid'>, token: Pick<TokenEntity, 'size'> | undefined, point: { x: number; y: number }): { x: number; y: number } {
  const size = typeof token?.size === 'number' && token.size > 0 ? token.size : 1;
  return snapDroppedToken(state.grid, point, size);
}

/** The drag of a token the player may no longer move, or that left the scene, ends unsent; true when one was told to end. */
export function cancelLostDrag(state: Pick<ViewAtlasState, 'remoteView' | 'selectedIds' | 'objects'>, eventBus: Pick<EventEmitter, 'emit'>): boolean {
  const lost = state.selectedIds.some((id) => !mayDragInRemoteView(state, id) || !Object.hasOwn(state.objects.tokens, id));
  if (lost) eventBus.emit(REMOTE_DRAG_CANCEL);
  return lost;
}
