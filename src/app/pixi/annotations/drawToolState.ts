import type { DrawMode } from '../../annotations/annotationTypes';
import type { ViewState } from '../../types/viewState';

/** What tells whether the Draw tool is in hand, and in which mode. */
export type DrawToolState = Pick<ViewState, 'activeTool' | 'drawTool'>;

/** The mode the Draw tool is in while it is the tool in hand; null while another tool is. */
export function activeDrawMode(state: DrawToolState): DrawMode | null {
  return state.activeTool === 'draw' ? state.drawTool.mode : null;
}
