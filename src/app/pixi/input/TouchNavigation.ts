import { Point } from 'pixi.js';
import type { ClampZoom, Viewport } from 'pixi-viewport';
import { SmoothDecelerate } from '../SmoothDecelerate';
import { SmoothWheelZoom } from '../SmoothWheelZoom';

/** How long after the last change of zoom a release still counts as the end of a pinch, which does not coast. */
const PINCH_REST_MS = 100;
/** A double tap zooms by one doubling, a notch of the wheel at its limit. */
const STEP_DOUBLINGS = 1;

/**
 * The camera under fingers: one finger pans, two pan and zoom about the point between them. It
 * moves the viewport as its own plugins do (the zoom range of `clamp-zoom`, the `moved` and
 * `zoomed` events everything that follows the camera hears, the coast of `decelerate` after a
 * pan), so a pinch is drawn as a wheel zoom is: by the change of the viewport alone.
 */
export class TouchNavigation {
  private readonly anchor = new Point();
  private readonly world = new Point();
  private readonly drifted = new Point();
  private zoomedAt = -Infinity;
  /** The fingers have moved the map since they took it. */
  private moving = false;

  constructor(private readonly viewport: Viewport) {}

  /** Fingers take the map: its coast ends. */
  begin(): void {
    this.decelerate()?.halt();
    this.zoomedAt = -Infinity;
    this.moving = false;
  }

  /**
   * The fingers move the map: a step of zoom that still glides and a camera on its way somewhere
   * (Fit, a token brought into view) end where they are, or they would pull against the fingers.
   * Not before: the fingers of a tap leave the zoom of the tap before them to finish.
   */
  private take(): void {
    if (this.moving) return;
    this.moving = true;
    const wheel = this.viewport.plugins.get('wheel', true);
    if (wheel instanceof SmoothWheelZoom) wheel.halt();
    this.viewport.plugins.remove('animate');
  }

  pan(dx: number, dy: number): void {
    const { viewport } = this;
    this.take();
    viewport.x += dx;
    viewport.y += dy;
    this.decelerate()?.track();
    viewport.emit('moved', { viewport, type: 'drag' });
  }

  /** The point between two fingers went from one place of the screen to another while they came `toSpan / fromSpan` times as far apart. */
  pinch(fromX: number, fromY: number, fromSpan: number, toX: number, toY: number, toSpan: number): void {
    const { viewport } = this;
    this.take();
    // The world point under the fingers stays under them.
    viewport.toLocal(this.anchor.set(fromX, fromY), undefined, this.world);
    const before = viewport.scale.x;
    if (fromSpan > 0 && toSpan > 0) {
      viewport.scale.set(before * toSpan / fromSpan);
      viewport.plugins.get<ClampZoom>('clamp-zoom', true)?.clamp();
    }
    viewport.toGlobal(this.world, this.drifted);
    viewport.x += toX - this.drifted.x;
    viewport.y += toY - this.drifted.y;
    if (viewport.scale.x !== before) {
      this.zoomedAt = performance.now();
      viewport.emit('zoomed', { viewport, type: 'pinch' });
    }
    this.decelerate()?.track();
    viewport.emit('moved', { viewport, type: 'pinch' });
  }

  /** The fingers are gone; after a pan the map coasts on, after a pinch it stays. */
  end(glide: boolean): void {
    const decelerate = this.decelerate();
    if (glide && performance.now() - this.zoomedAt > PINCH_REST_MS) decelerate?.glide();
    else decelerate?.halt();
  }

  /** One step of zoom about a point of the screen, gliding as a notch of the wheel does. */
  zoomStep(x: number, y: number, direction: 1 | -1): void {
    const wheel = this.viewport.plugins.get('wheel', true);
    if (wheel instanceof SmoothWheelZoom) wheel.zoomBy(direction * STEP_DOUBLINGS, new Point(x, y));
  }

  private decelerate(): SmoothDecelerate | null {
    const plugin = this.viewport.plugins.get('decelerate', true);
    return plugin instanceof SmoothDecelerate ? plugin : null;
  }
}
