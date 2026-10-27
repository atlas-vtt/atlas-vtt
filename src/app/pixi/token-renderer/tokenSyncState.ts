import type { ViewState } from '../../types/viewState';
import { mapTokens } from '../../tokens/offMap';
import { levelObjects } from '../../levels/levelObjects';

/** State used to synchronize token sprites and their movement controls. */
export interface TokenSyncState {
  tokens: ViewState['objects']['tokens'];
  isMapLoading: ViewState['isMapLoading'];
  selectedIds: ViewState['selectedIds'];
}

/**
 * What the token sprites follow of a view's state: the tokens on the map (`mapTokens`) of the level
 * it shows (`levelObjects`), so a combatant kept beside it gets no sprite, and with it no hit area,
 * controls, badge or place in a picture of the scene (canvas, players' frame, thumbnail).
 */
export function tokenSyncState(state: Pick<ViewState, 'objects' | 'levels' | 'viewedLevel' | 'isMapLoading' | 'selectedIds'>): TokenSyncState {
  return { tokens: mapTokens(levelObjects(state)), isMapLoading: state.isMapLoading, selectedIds: state.selectedIds };
}
