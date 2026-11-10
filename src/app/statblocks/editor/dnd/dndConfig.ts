/** What every drag-and-drop context of the statblock editor shares (§7.6). */

/** Marks the editor's root while a block is held: its chrome steps aside and its keys stand aside for the drag's. */
export const DRAGGING_ATTRIBUTE = 'data-dragging';

/** A press becomes a drag after 4 px, so a click still selects. */
export const POINTER_ACTIVATION = { activationConstraint: { distance: 4 } };

/** dnd-kit says nothing: the editor and the pane say what a drag did, in their own live regions. */
export const SILENT_ANNOUNCEMENTS = {
  onDragStart: (): undefined => undefined,
  onDragOver: (): undefined => undefined,
  onDragEnd: (): undefined => undefined,
  onDragCancel: (): undefined => undefined,
};
