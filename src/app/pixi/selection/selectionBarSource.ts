import type { Viewport } from 'pixi-viewport';
import type { Frame } from '../../annotations/annotationFrame';
import { levelObjects } from '../../levels/levelObjects';
import type { SelectionAction } from '../../selection/selectionActions';
import type { ViewAtlasStore } from '../../storeFactory';
import { mapTokens } from '../../tokens/offMap';
import { frameOnCanvas } from '../annotations/frameOnCanvas';
import type { Box } from './selectionGeometry';

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

  /** Whether something selected shows on the canvas. */
  shows(): boolean {
    return (this.parts.selection()?.shownBox() ?? null) !== null || (this.parts.annotations()?.barFrame() ?? null) !== null;
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
    const take = ({ x, y }: { x: number; y: number }): void => {
      out.left = Math.min(out.left, x);
      out.right = Math.max(out.right, x);
      out.top = Math.min(out.top, y);
      out.bottom = Math.max(out.bottom, y);
    };
    if (box) {
      take(viewport.toScreen(box.x, box.y));
      take(viewport.toScreen(box.x + box.width, box.y + box.height));
    }
    if (frame) frameOnCanvas(frame, viewport).forEach(take);
    return true;
  }
}
