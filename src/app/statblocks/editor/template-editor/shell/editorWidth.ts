/**
 * How wide the template editor stands: wide and medium views keep the dock at
 * the note column's right edge, beside the card; below `STACKED_BELOW` the card stands above the
 * note, as in a note view, and the dock's kinds move into the capsule's menu.
 * Pure: the editor measures, this decides.
 */

/** Below this view width the editor is medium. */
export const WIDE_EDITOR_FROM = 900;
/** Below this view width the card stands above the note, as in a note view (`STACK_BELOW`). */
export const STACKED_BELOW = 720;

export type EditorWidth = 'wide' | 'medium' | 'stacked';

export function editorWidthOf(viewWidth: number): EditorWidth {
  if (viewWidth > 0 && viewWidth < STACKED_BELOW) return 'stacked';
  return viewWidth > 0 && viewWidth < WIDE_EDITOR_FROM ? 'medium' : 'wide';
}
