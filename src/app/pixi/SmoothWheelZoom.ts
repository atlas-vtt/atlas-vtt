import { Wheel } from 'pixi-viewport';
import type { ClampZoom, IWheelOptions } from 'pixi-viewport';
import type { Point } from 'pixi.js';
import { prefersReducedMotion } from '../utils/motion';

/** Time constant of the zoom's exponential glide: 95% of the way is covered after three of these. */
const ZOOM_TIME_CONSTANT_MS = 55;
/** Remaining zoom (in doublings) below which the glide snaps to its target, far below a pixel. */
const SETTLE_DOUBLINGS = 1e-4;
/** Most zoom (in doublings) one wheel event may add, so accelerated wheel flicks stay controllable. */
const MAX_EVENT_DOUBLINGS = 1;

/** What a notch of a mouse wheel reports as its `deltaY`, in pixels (Chromium on Windows and Linux). */
const WHEEL_NOTCH_PX = 100;

type WheelZoomOptions = Pick<Required<IWheelOptions>, 'percent' | 'reverse' | 'lineHeight'>;

/**
 * Zoom requested by one wheel event, in doublings (log2 of the scale factor); positive zooms in.
 * Uses pixi-viewport's own wheel sensitivity so a notch zooms as far as before, only smoothly.
 */
export function wheelZoomDoublings(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>, options: WheelZoomOptions): number {
  const lines = event.deltaMode ? options.lineHeight : 1;
  const direction = options.reverse ? 1 : -1;
  const doublings = (1 + options.percent) * direction * event.deltaY * lines / 500;
  return Math.max(-MAX_EVENT_DOUBLINGS, Math.min(MAX_EVENT_DOUBLINGS, doublings));
}

/**
 * Moves `scale` toward `target` for `elapsedMs`. The approach is exponential in log space, so it
 * feels equally fast at every zoom level and does not depend on the frame rate.
 */
export function approachScale(scale: number, target: number, elapsedMs: number): number {
  const remaining = Math.log2(target / scale);
  if (Math.abs(remaining) < SETTLE_DOUBLINGS) return target;
  return scale * 2 ** (remaining * (1 - Math.exp(-elapsedMs / ZOOM_TIME_CONSTANT_MS)));
}

/**
 * pixi-viewport `wheel` plugin whose wheel zoom glides instead of jumping one step per notch.
 *
 * Each wheel event moves a target scale; every frame the viewport eases toward it while the map
 * point under the cursor stays put, so quick notches blend into one continuous zoom. Trackpad
 * pinches and scroll-to-pan keep pixi-viewport's direct handling: those events already arrive
 * every frame, and easing them would only add lag.
 */
export class SmoothWheelZoom extends Wheel {
  private targetScale: number | null = null;
  private anchor: Point | null = null;
  /** Scale this plugin last set; any other value means something else zoomed meanwhile. */
  private appliedScale = 0;

  override wheel(event: WheelEvent): boolean {
    const pinch = event.ctrlKey && this.options.trackpadPinch;
    if (this.paused || pinch || !this.options.wheelZoom || !this.checkKeyPress()) {
      this.stop();
      return super.wheel(event);
    }

    this.zoomBy(wheelZoomDoublings(event, this.options), this.parent.input.getPointerPosition(event));

    this.parent.emit('wheel-start', { event, viewport: this.parent });
    return !this.parent.options.passiveWheel;
  }

  /** How far one notch of a mouse wheel zooms, in doublings: the step of the zoom buttons. */
  get notchDoublings(): number {
    return Math.abs(wheelZoomDoublings({ deltaY: WHEEL_NOTCH_PX, deltaMode: 0 }, this.options));
  }

  /**
   * Zooms by `doublings` about `anchor`, a point of the screen, with the wheel's glide and within
   * its limits: what a notch of the wheel does, for input that is no wheel (a double tap, a zoom button).
   */
  zoomBy(doublings: number, anchor: Point): void {
    const { min, max } = this.scaleLimits();
    const from = this.targetScale ?? this.parent.scale.x;
    this.targetScale = Math.max(min, Math.min(max, from * 2 ** doublings));
    this.anchor = anchor;
    this.appliedScale = this.parent.scale.x;
    if (prefersReducedMotion(this.parent.options.events.domElement)) {
      this.zoomAround(this.targetScale, this.anchor);
      this.stop();
    }
  }

  /** pixi-viewport passes the frame's elapsed milliseconds, though `Wheel` declares no parameter. */
  override update(elapsed = this.parent.options.ticker.elapsedMS): void {
    if (this.targetScale === null || this.anchor === null) return;
    if (this.paused || this.parent.scale.x !== this.appliedScale) {
      this.stop();
      return;
    }
    const scale = approachScale(this.parent.scale.x, this.targetScale, elapsed);
    this.zoomAround(scale, this.anchor);
    // Also stops when clamp-zoom refused the scale, instead of pushing against it every frame.
    if (this.appliedScale !== scale || scale === this.targetScale) this.stop();
  }

  override down(): boolean {
    if (this.options.interrupt) this.stop();
    return false;
  }

  override pause(): void {
    this.stop();
    super.pause();
  }

  /** Ends the glide where it is: something else has the camera (fingers, whose press the plugin never hears). */
  halt(): void {
    this.stop();
  }

  private stop(): void {
    this.targetScale = null;
    this.anchor = null;
  }

  private scaleLimits(): { min: number; max: number } {
    const options = this.parent.plugins.get<ClampZoom>('clamp-zoom', true)?.options;
    return {
      min: typeof options?.minScale === 'number' ? options.minScale : 0,
      max: typeof options?.maxScale === 'number' ? options.maxScale : Infinity,
    };
  }

  /** Sets the scale while keeping the world point under `anchor` (a screen point) in place. */
  private zoomAround(scale: number, anchor: Point): void {
    const viewport = this.parent;
    const container = viewport.parent;
    const world = viewport.toLocal(anchor);
    viewport.scale.set(scale);
    viewport.plugins.get<ClampZoom>('clamp-zoom', true)?.clamp();
    // The viewport's position lives in its parent's space (screen space when it has none).
    const drifted = container ? container.toLocal(world, viewport) : viewport.toGlobal(world);
    const pinned = container ? container.toLocal(anchor) : anchor;
    viewport.x += pinned.x - drifted.x;
    viewport.y += pinned.y - drifted.y;
    this.appliedScale = viewport.scale.x;
    viewport.emit('zoomed', { viewport, type: 'wheel' });
    viewport.emit('moved', { viewport, type: 'wheel' });
  }
}
