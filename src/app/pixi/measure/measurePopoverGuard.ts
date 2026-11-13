import { levelObjects } from '../../levels/levelObjects';
import { readMeasure } from '../../measure/keptMeasures';
import type { KeptMeasure } from '../../measure/measureTypes';
import type { UISlice } from '../../stores/uiSlice';
import type { ViewState } from '../../types/viewState';

/** What says whether a kept measurement can be edited. */
export type MeasureEditState = Pick<ViewState, 'objects' | 'levels' | 'viewedLevel' | 'isGMView' | 'isMapLoading' | 'isPlayerView'>;

/** The kept measurement `id` on the level shown, as it is read; null when it is gone or is none. */
export function keptMeasure(state: Pick<MeasureEditState, 'objects' | 'levels' | 'viewedLevel'>, id: string): KeptMeasure | null {
  return readMeasure(id, levelObjects(state).measures?.[id]);
}

/** A kept measurement's handle and popover need the measurement on the level shown, and the GM's view of a loaded scene. */
export function mayEditMeasure(state: MeasureEditState, id: string): boolean {
  return !!keptMeasure(state, id) && state.isGMView && !state.isPlayerView && !state.isMapLoading;
}

/**
 * Closes the popover of a kept measurement that can no longer be edited: deleted or cleared,
 * taken away by undo, on a level the view no longer shows, or the view no longer the GM's of a
 * loaded scene. Called on every store change.
 */
export function closeStaleMeasurePopover(state: MeasureEditState & Pick<UISlice, 'measurePopover' | 'closeMeasurePopover'>): void {
  if (state.measurePopover && !mayEditMeasure(state, state.measurePopover)) state.closeMeasurePopover();
}
