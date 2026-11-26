import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../types/visionTypes';
import { hearPressesLast, isHandled } from '../utils/handledEvents';
import { isPrimaryPress } from '../utils/pointerButtons';

/** What a press of the Draw tool places, in the mode that places by a press. */
export interface ClickPlacingHost {
  /** Whether a press places a stamp now: the Stamp mode is in hand, on the GM's view of the canvas. */
  ready(): boolean;
  /** A press at `world` in Stamp mode; `free` while Alt frees it from the grid. */
  stamp(world: Point, free: boolean): void;
}

/**
 * The Draw tool's presses in its Stamp mode, on a viewport: a stamp is placed by the press. The
 * primary button only, so a right-drag pans, and no press that a pin, a badge, a handle or a stamp
 * that is there took (`ownKind`).
 */
export class ClickPlacing {
  private enabled = false;

  constructor(private readonly viewport: Viewport, private readonly host: ClickPlacingHost) {}

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.viewport[enabled ? 'on' : 'off']('pointerdown', this.onPointerDown);
  }

  /** The dispatch that claims presses listens now: these presses are heard after it. */
  hearPressesLast(): void {
    if (this.enabled) hearPressesLast(this.viewport, this.onPointerDown);
  }

  destroy(): void {
    this.setEnabled(false);
  }

  private readonly onPointerDown = (e: FederatedPointerEvent): void => {
    if (!this.host.ready() || !isPrimaryPress(e) || isHandled(e)) return;
    const { x, y } = this.viewport.toWorld(e.global);
    this.host.stamp({ x, y }, e.altKey === true);
  };
}
