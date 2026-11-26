import type { MeasureToolOptions } from './measureTypes';
import type { ViewState } from '../types/viewState';

type HeldState = Pick<ViewState, 'activeTool' | 'heldRulerFrom'>;

/** The tool the toolbar shows: during a press with the measure key held, the tool that waits for it. */
export function shownTool(state: HeldState): ViewState['activeTool'] {
  return state.heldRulerFrom ?? state.activeTool;
}

/** The measure tool's choices as a press uses them: with the measure key held, a ruler that is never kept. */
export function measureToolInUse(state: { readonly measureTool: MeasureToolOptions; readonly heldRulerFrom?: ViewState['activeTool'] | undefined }): MeasureToolOptions {
  return state.heldRulerFrom === undefined ? state.measureTool : { ...state.measureTool, mode: 'ruler', keep: false };
}
