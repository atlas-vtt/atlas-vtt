/**
 * Where the step panel of an open die opens: under the die, else beside it
 * clear of its fan, else over it where the fan was, and where none of these
 * holds it, on the roomier of under and over, no taller than the room there
 * (it scrolls). Pure: every box is in px of one coordinate space.
 */

export type StepPanelSide = 'below' | 'above' | 'right' | 'left';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface StepPanelAnchor {
  /** The die's centre. */
  x: number;
  y: number;
  /** The die's top, and the bottom of its label. */
  top: number;
  bottom: number;
  /** How far the die and its fan reach left and right of its centre. */
  reach: number;
}

export interface StepPanelPlace {
  left: number;
  top: number;
  side: StepPanelSide;
  /** The room on its side, where the panel is taller than that; else null. */
  maxHeight: number | null;
}

/** Room between the die (or its label or fan) and the panel, and the panel and the frame's edge. */
export const STEP_PANEL_GAP = 8;

const clamp = (value: number, least: number, most: number): number => Math.max(least, Math.min(most, value));

/** The panel of `width` × `height` beside the die in `anchor`, inside `frame`. */
export function placeStepPanel(anchor: StepPanelAnchor, width: number, height: number, frame: Box): StepPanelPlace {
  const gap = STEP_PANEL_GAP;
  const centredX = clamp(anchor.x - width / 2, frame.left + gap, frame.right - gap - width);
  const roomBelow = frame.bottom - gap - (anchor.bottom + gap);
  const roomAbove = anchor.top - gap - (frame.top + gap);
  if (height <= roomBelow) return { left: centredX, top: anchor.bottom + gap, side: 'below', maxHeight: null };

  // Beside the die the fan stays open; over it the panel takes the fan's place
  if (height <= frame.bottom - frame.top - 2 * gap) {
    const top = clamp(anchor.y - height / 2, frame.top + gap, frame.bottom - gap - height);
    const right = anchor.x + anchor.reach + gap;
    if (right + width <= frame.right - gap) return { left: right, top, side: 'right', maxHeight: null };
    const left = anchor.x - anchor.reach - gap - width;
    if (left >= frame.left + gap) return { left, top, side: 'left', maxHeight: null };
  }
  if (height <= roomAbove) return { left: centredX, top: anchor.top - gap - height, side: 'above', maxHeight: null };

  const above = roomAbove > roomBelow;
  const room = Math.max(0, Math.floor(above ? roomAbove : roomBelow));
  const shown = Math.min(height, room);
  return { left: centredX, top: above ? anchor.top - gap - shown : anchor.bottom + gap, side: above ? 'above' : 'below', maxHeight: room };
}
