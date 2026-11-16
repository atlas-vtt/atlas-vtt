/**
 * What a shape under way will reveal, as the GM alone sees it: a light wash in the revealing
 * colour over the ground the shape takes fog from. The fog's canvas is the players' picture too,
 * so a shape that may yet not reveal (the pointer pulls back, Escape drops it) takes nothing
 * from that canvas before it is committed.
 */
import { Graphics } from 'pixi.js';
import { strokePolygons } from '../../lighting/exploredEdits';
import { STROKE_COLORS, type StrokeShape } from '../../tools/shapeStroke';

/** How strong the wash lies on the fog: enough to tell the shape, and the fog under it still shows. */
const WASH_ALPHA = 0.28;

export class FogRevealWash {
  readonly view = new Graphics({ label: 'fog-reveal-wash', eventMode: 'none' });
  private drawn = false;

  /** `gmAlone` says whether the canvas shows the GM's own view: no other view gets the wash. */
  constructor(private readonly gmAlone: () => boolean) {}

  /** Shows what `shapes` will reveal; nothing for none, and on a canvas that shows the players' view. */
  show(shapes: readonly StrokeShape[]): void {
    this.clear();
    if (!this.gmAlone()) return;
    // The pieces of a shape do not overlap, so the wash is as strong everywhere, also where a lasso crosses itself.
    for (const shape of shapes) {
      for (const piece of strokePolygons(shape)) {
        this.view.poly(piece.flatMap((point) => [point.x, point.y])).fill({ color: STROKE_COLORS.erase, alpha: WASH_ALPHA });
        this.drawn = true;
      }
    }
  }

  clear(): void {
    if (!this.drawn) return;
    this.drawn = false;
    this.view.clear();
  }

  destroy(): void {
    if (!this.view.destroyed) this.view.destroy();
  }
}
