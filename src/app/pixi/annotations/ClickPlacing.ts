import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../types/visionTypes';
import { hearPressesLast, isHandled, isHandledTap } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';

/** What a click of the Draw tool places, in the modes that place by a click. */
export interface ClickPlacingHost {
  /** The mode a click places in now; null while the tool is not in hand or its mode places nothing by a click. */
  mode(): 'stamp' | 'text' | null;
  /** A press at `world` in Stamp mode; `free` while Alt frees it from the grid. */
  stamp(world: Point, free: boolean): void;
  /** A click at `world` in Text mode. */
  text(world: Point): void;
}

/**
 * The Draw tool's clicks in its Stamp and Text modes, on a viewport. A stamp is placed by the
 * press. A text is asked for by the click (the tap that ends a press in place), so a right-drag
 * that pans, which ends in a tap too, and a press a pin or a badge took ask for none.
 */
export class ClickPlacing {
  private enabled = false;

  constructor(private readonly viewport: Viewport, private readonly host: ClickPlacingHost) {}

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    const change = enabled ? 'on' : 'off';
    this.viewport[change]('pointerdown', this.onPointerDown);
    this.viewport[change]('pointertap', this.onPointerTap);
  }

  /** The dispatch that claims presses listens now: these clicks are heard after it. */
  hearPressesLast(): void {
    if (this.enabled) hearPressesLast(this.viewport, this.onPointerDown);
  }

  destroy(): void {
    this.setEnabled(false);
  }

  private readonly onPointerDown = (e: FederatedPointerEvent): void => {
    if (this.host.mode() !== 'stamp' || !isPrimaryPress(e) || isHandled(e)) return;
    const { x, y } = this.viewport.toWorld(e.global);
    this.host.stamp({ x, y }, e.altKey === true);
  };

  private readonly onPointerTap = (e: FederatedPointerEvent): void => {
    if (this.host.mode() !== 'text' || !isPrimaryPress(e) || isHandledTap(e)) return;
    const { x, y } = this.viewport.toWorld(e.global);
    this.host.text({ x, y });
  };
}
