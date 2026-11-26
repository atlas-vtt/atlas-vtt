import type { FederatedPointerEvent } from 'pixi.js';

/**
 * What the viewport's dispatch (`TokenRenderer`) asks about drawings and texts. No annotation
 * listens to the pointer itself: the dispatch asks here where their turn comes, and they say by the
 * tool in hand what they take (`AnnotationInteraction`).
 */
export interface AnnotationPointerHandlers {
  /** A primary press on a handle of the selection (a corner, a side, the turn handle, a line's point), with any tool that shows them; true when one took it. */
  gripDown(worldX: number, worldY: number, event: FederatedPointerEvent): boolean;
  /** A primary press where the tool in hand lets annotations take one; true when an annotation or the selection's frame took it. */
  pointerDown(worldX: number, worldY: number, event: FederatedPointerEvent): boolean;
  /**
   * Whether a secondary press here asks for the annotations' menu: on an annotation a press would
   * take, or inside the selection's frame. It changes nothing: a fill or a frame covers a stretch
   * of the map, so the press stays the viewport's and a right-drag from it pans.
   */
  menuAt(worldX: number, worldY: number): boolean;
  /**
   * The secondary press at this place was released where it began (`event`): selects the
   * annotation there, where it was not, and opens the menu at the pointer. True when it opened.
   */
  openMenu(worldX: number, worldY: number, event: FederatedPointerEvent): boolean;
  /** The selected annotations follow a drag of the tokens selected with them, begun by the press `event`. */
  dragAlong(event: FederatedPointerEvent): void;
  /**
   * The cursor over a handle or an annotation a press would take, which it marks; null over none.
   * `covered` says whether a token lies there, which the move and select tools give the press to.
   * `free` while Alt is held: a mode that places by a press then takes nothing of its own kind.
   */
  cursorAt(worldX: number, worldY: number, covered: () => boolean, free?: boolean): string | null;
  /** The pointer left the canvas, or is over something that takes the press before any annotation. */
  leave(): void;
}
