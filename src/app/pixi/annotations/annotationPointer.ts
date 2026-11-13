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
  /** A secondary press; true when it opened the menu of the annotation there. */
  secondaryDown(worldX: number, worldY: number, event: FederatedPointerEvent): boolean;
  /** The selected annotations follow a drag of the tokens selected with them, begun by the press `event`. */
  dragAlong(event: FederatedPointerEvent): void;
  /**
   * The cursor over a handle or an annotation a press would take, which it marks; null over none.
   * `covered` says whether a token lies there, which the move and select tools give the press to.
   */
  cursorAt(worldX: number, worldY: number, covered: () => boolean): string | null;
  /** The pointer left the canvas, or is over something that takes the press before any annotation. */
  leave(): void;
}
