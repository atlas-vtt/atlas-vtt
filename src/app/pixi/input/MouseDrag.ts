import { Drag } from 'pixi-viewport';
import type { FederatedPointerEvent } from 'pixi.js';

/**
 * pixi-viewport's `drag` for the mouse alone. The plugin applies its button filter to mice only,
 * so every finger and pen panned the map while it also drove the tool. A finger's pan is the
 * gesture layer's (`TouchGestures`); a pen is the tool, and pans with the button a mouse pans with.
 */
export class MouseDrag extends Drag {
  protected override checkButtons(event: FederatedPointerEvent): boolean {
    if (event.pointerType === 'touch') return false;
    if (event.pointerType === 'pen' && !this.mouse[event.button]) return false;
    return super.checkButtons(event);
  }
}
