import { AlphaFilter, Container, Graphics } from 'pixi.js';
import { readDrawing } from '../../annotations/annotationList';
import { curveTolerance } from '../../annotations/drawingInk';
import type { LiveDrawing } from '../../annotations/madeDrawing';
import { paintDrawing } from '../drawingLayer';
import { destroyTree } from '../utils/destroyTree';

/** The points of a pen's stroke that are drawn once and kept, a piece at a time. */
const SETTLED_PIECE = 256;

/**
 * The drawing under way, drawn by the rule every finished drawing is drawn by (`paintDrawing`),
 * so what is seen under the pointer is what stays. It lies in the layer its drawing will lie in:
 * on the map or above the tokens, and among what only the GM sees while the drawing is kept from
 * the players.
 *
 * A pen's stroke grows at its end alone, so its start is drawn once: every `SETTLED_PIECE` points
 * become a piece that is kept, and a pointer move draws only the points since, however long the
 * stroke. A see-through stroke must be one even tone over all of itself: the finished one is
 * filled as one outline, which costs milliseconds for a long stroke and cannot be worked out with
 * every move, so the stroke under way is drawn solid and its whole view made see-through as one.
 * That is the same picture: one tone, also where the stroke crosses itself.
 */
export class LiveStroke {
  private readonly view = new Container({ label: 'annotation-live', eventMode: 'none', interactiveChildren: false, zIndex: Number.MAX_SAFE_INTEGER });
  private readonly tail = new Graphics();
  private readonly settled: Graphics[] = [];
  /** Makes the view see-through as one picture: on it only while a see-through pen is drawn. */
  private readonly even = new AlphaFilter({ alpha: 1, resolution: 'inherit', antialias: 'inherit' });
  private faded = false;
  /** The index of the pen's point the tail starts at. */
  private kept = 0;

  constructor() {
    this.view.addChild(this.tail);
  }

  /** Shows `input` in `layer`, at the zoom it is drawn at. Each call for one stroke of a pen hands in the same points and more. */
  show(layer: Container, input: LiveDrawing, zoom: number): void {
    if (this.view.parent !== layer) layer.addChild(this.view);
    if (input.type !== 'pen') {
      // A shape has a few corners: it is drawn whole, by the rule that draws it once it is made.
      this.unsettle();
      this.fade(1);
      paint(this.tail, input, zoom);
      return;
    }
    const { points } = input;
    const solid = { ...input, opacity: 1 };
    while (points.length - this.kept > 2 * SETTLED_PIECE) {
      const piece = new Graphics();
      // One point more: the next piece begins on it, and the round ends of the two meet.
      paint(piece, { ...solid, points: points.slice(this.kept, this.kept + SETTLED_PIECE + 1) }, zoom);
      this.view.addChildAt(piece, this.settled.length);
      this.settled.push(piece);
      this.kept += SETTLED_PIECE;
    }
    paint(this.tail, { ...solid, points: points.slice(this.kept) }, zoom);
    this.fade(input.opacity);
  }

  /** Takes the drawing off the map. */
  clear(): void {
    this.unsettle();
    this.fade(1);
    this.tail.clear();
    this.view.removeFromParent();
  }

  destroy(): void {
    this.fade(1);
    this.even.destroy();
    destroyTree(this.view);
  }

  /** Shows the whole view at `alpha`, as one picture; at 1 it is drawn as it is, through no filter. */
  private fade(alpha: number): void {
    const faded = alpha < 1;
    if (faded) this.even.alpha = alpha;
    if (faded === this.faded) return;
    this.faded = faded;
    this.view.filters = faded ? [this.even] : null;
  }

  private unsettle(): void {
    for (const piece of this.settled) destroyTree(piece);
    this.settled.length = 0;
    this.kept = 0;
  }
}

function paint(graphics: Graphics, input: LiveDrawing, zoom: number): void {
  const drawing = readDrawing('live', { id: 'live', kind: 'drawing', timestamp: 0, ...input });
  if (!drawing || drawing.shape === 'stamp') graphics.clear();
  else paintDrawing(graphics, drawing, curveTolerance(zoom, drawing.width));
}
