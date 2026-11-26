import type { Container } from 'pixi.js';
import { FINGER_TARGET_RADIUS, fingerReaches } from './pointerReach';

/**
 * The round hit area of a small control on the map (a token's resize and rotate handles, its
 * +/- buttons, the handle that turns a selection). A mouse and a pen take it where it is drawn.
 * A finger takes it as far from its middle as a finger needs on screen, whatever the zoom, but
 * only where the control's own middle is nearer than any rival's: the middle of what it stands
 * on (its parent's origin, a token's centre) and the middles of the other controls there. So a
 * press that is clearly on the token stays the token's, and of two controls close together the
 * nearer one answers.
 *
 * PIXI asks on every move of a pointer over the map: nothing is allocated here.
 */
export class HandleHitArea {
  /**
   * @param owner The control, whose local space the area is in.
   * @param radius The control's drawn radius, in its own units.
   * @param rivalLabel The label of the controls beside it in its parent; null where it stands alone and on nothing.
   */
  constructor(private readonly owner: Container, public radius: number, private readonly rivalLabel: string | null = null) {}

  contains(x: number, y: number): boolean {
    const distance = x * x + y * y;
    if (distance <= this.radius * this.radius) return true;
    if (!fingerReaches()) return false;
    const { a, b } = this.owner.worldTransform;
    const scale = Math.hypot(a, b);
    if (!(scale > 0)) return false;
    const reach = FINGER_TARGET_RADIUS / scale;
    if (distance > reach * reach) return false;
    return this.rivalLabel === null || this.nearestOfRivals(x, y, this.rivalLabel);
  }

  private nearestOfRivals(x: number, y: number, label: string): boolean {
    const { owner } = this;
    const parent = owner.parent;
    if (!parent) return true;
    // The point and the middles, in the parent's units
    const local = owner.localTransform;
    const px = local.a * x + local.c * y + local.tx;
    const py = local.b * x + local.d * y + local.ty;
    const own = (px - local.tx) ** 2 + (py - local.ty) ** 2;
    if (px * px + py * py < own) return false;
    for (const sibling of parent.children) {
      if (sibling === owner || sibling.label !== label || !sibling.visible) continue;
      if ((px - sibling.x) ** 2 + (py - sibling.y) ** 2 < own) return false;
    }
    return true;
  }
}
