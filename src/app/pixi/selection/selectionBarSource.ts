import type { Viewport } from 'pixi-viewport';
import { frameCorners, framePoint, type Frame } from '../../annotations/annotationFrame';
import { HANDLE_LOOK } from '../../annotations/annotationHandles';
import { levelObjects } from '../../levels/levelObjects';
import type { SelectionAction } from '../../selection/selectionActions';
import type { ViewAtlasStore } from '../../storeFactory';
import { mapTokens } from '../../tokens/offMap';
import type { Box } from './selectionGeometry';

/** From an annotation frame's line to the outer edge of its corner handles, screen pixels. */
const HANDLE_REACH = HANDLE_LOOK.gap + HANDLE_LOOK.grip;
/** From the frame's line to the far edge of its turn handle, screen pixels. */
const TURN_REACH = HANDLE_LOOK.gap + HANDLE_LOOK.stem + HANDLE_LOOK.turnRadius;

/** A box in the canvas' pixels. */
export interface ScreenBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** What the bar above a selection asks of the tokens. */
export interface BarTokens {
  tokenActions(tokenId: string, at: { x: number; y: number }): SelectionAction[];
  /** A token is being resized or turned by its handles. */
  transforming(): boolean;
}

/** What it asks of the selection's marks. */
export interface BarSelection {
  shownBox(): Box | null;
  readonly busy: boolean;
}

/** What it asks of the drawings and texts. */
export interface BarAnnotations {
  /** The frame of the selected drawings and texts with handles of their own; null for none, and while they are dragged. */
  barFrame(): Frame | null;
  selectionActions(): SelectionAction[];
  /** One of them is being dragged, resized or turned. */
  readonly reshaping: boolean;
}

export interface SelectionBarParts {
  readonly store: ViewAtlasStore;
  readonly viewport: Viewport;
  tokens(): BarTokens | null | undefined;
  selection(): BarSelection | null | undefined;
  annotations(): BarAnnotations | null | undefined;
}

/**
 * What the bar above a selection reads of a map view: what can be done with what is selected,
 * where the selection stands on the canvas, and whether it is being moved or reshaped.
 */
export class SelectionBarSource {
  constructor(private readonly parts: SelectionBarParts) {}

  /**
   * What can be done with the selection, for a menu or popover at `at` (a point of the window):
   * the actions of the first selected token of the level shown, which act on the whole selection,
   * or, where no token is selected, those of the selected drawings and texts.
   */
  actions(at: { x: number; y: number }): SelectionAction[] {
    const state = this.parts.store.getState();
    const tokens = mapTokens(levelObjects(state));
    const token = state.selectedIds.find((id) => tokens[id] !== undefined);
    if (token !== undefined) return this.parts.tokens()?.tokenActions(token, at) ?? [];
    return this.parts.annotations()?.selectionActions() ?? [];
  }

  /** The selection is dragged, resized or turned, or a marquee is being drawn. */
  busy(): boolean {
    const { parts } = this;
    return parts.store.getState().isDragging
      || parts.tokens()?.transforming() === true
      || parts.selection()?.busy === true
      || parts.annotations()?.reshaping === true;
  }

  /**
   * Writes the box around everything the selection shows on the canvas into `out`, in the canvas'
   * pixels: its highlights with a token's bars and handles and a group's turn button, and the
   * frame of drawings and texts with its handles. False while the selection shows nothing.
   */
  shown(out: ScreenBox): boolean {
    const { viewport } = this.parts;
    const box = this.parts.selection()?.shownBox() ?? null;
    const frame = this.parts.annotations()?.barFrame() ?? null;
    if (!box && !frame) return false;
    out.left = out.top = Infinity;
    out.right = out.bottom = -Infinity;
    const take = (x: number, y: number): void => {
      const at = viewport.toScreen(x, y);
      out.left = Math.min(out.left, at.x);
      out.right = Math.max(out.right, at.x);
      out.top = Math.min(out.top, at.y);
      out.bottom = Math.max(out.bottom, at.y);
    };
    if (box) {
      take(box.x, box.y);
      take(box.x + box.width, box.y + box.height);
    }
    if (frame) {
      const zoom = Math.abs(viewport.scale.x) || 1;
      for (const corner of frameCorners(frame, HANDLE_REACH / zoom)) take(corner.x, corner.y);
      const turn = framePoint(frame, { x: 0, y: -1 }, TURN_REACH / zoom);
      take(turn.x, turn.y);
    }
    return true;
  }
}
