import type { ViewState } from '../../types/viewState';

/** State used to synchronize token sprites and their movement controls. */
export interface TokenSyncState {
  tokens: ViewState['objects']['tokens'];
  isMapLoading: ViewState['isMapLoading'];
  selectedIds: ViewState['selectedIds'];
}
