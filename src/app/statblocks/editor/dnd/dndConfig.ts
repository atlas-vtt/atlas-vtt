/** What every drag-and-drop context of the statblock editor shares (§7.6). */

/** Marks the editor's root while a block is held: its chrome steps aside and its keys stand aside for the drag's. */
export const DRAGGING_ATTRIBUTE = 'data-dragging';

/** A mouse's or a pen's press becomes a drag after 4 px, so a click still selects. */
export const POINTER_ACTIVATION = { activationConstraint: { distance: 4 } };

/** A touch becomes a drag after resting this long within `TOUCH_TOLERANCE` px, here and in a list's drag (`ListDrag`). */
export const TOUCH_DELAY_MS = 250;
export const TOUCH_TOLERANCE = 5;

/** A finger's press becomes a drag once it has rested; one that moves first is a swipe. */
export const TOUCH_ACTIVATION = { activationConstraint: { delay: TOUCH_DELAY_MS, tolerance: TOUCH_TOLERANCE } };

/** dnd-kit says nothing: the editor and the pane say what a drag did, in their own live regions. */
export const SILENT_ANNOUNCEMENTS = {
  onDragStart: (): undefined => undefined,
  onDragOver: (): undefined => undefined,
  onDragEnd: (): undefined => undefined,
  onDragCancel: (): undefined => undefined,
};
