import type { Application } from 'pixi.js';
import { MOTION_EASE_OUT, MOTION_SLOW_MS, prefersReducedMotion } from '../utils/motion';
import './scene-transition.scss';

/** The incoming map starts this much larger and settles in: reads as depth, not as a zoom. */
const SETTLE_SCALE = 1.015;

/**
 * Plays a frozen frame out over the canvas it froze and calls `done` once both are at rest.
 * Returns what stops it at once, leaving the canvas untransformed.
 */
export type FrameMotion = (frame: HTMLCanvasElement, target: HTMLCanvasElement, done: () => void) => () => void;

export interface SceneTransition {
  /** Plays from the frozen frame to whatever the canvas shows next: by default a crossfade as the new map settles in. */
  play(motion?: FrameMotion): void;
  /** Drops the frozen frame at once. */
  cancel(): void;
  /** Paints the frozen frame at its current opacity and scale, so an interrupted motion can be carried over. */
  paintInto(context: CanvasRenderingContext2D): void;
}

/**
 * Freezes the current map of the DM canvas as a still frame above it. While a scene
 * loads behind it, the still frame hides the half-built map; `play` then fades it
 * out while the new map settles in.
 *
 * @param previous A transition still fading out; its visible state is carried into the new frame.
 */
export function captureSceneTransition(app: Application, previous: SceneTransition | null): SceneTransition | null {
  const source = app.canvas;
  return freezeCanvasFrame(source, (context) => {
    // A WebGL canvas keeps its drawing buffer only until the frame is composited, so render and copy in one task
    app.renderer.render(app.stage);
    drawAsShown(context, source);
  }, previous);
}

export interface FreezeOptions {
  /**
   * Let the incoming map settle in with a slight scale (default). Turn it off for
   * canvases displayed with nearest-neighbour sampling (`image-rendering: pixelated`
   * or `crisp-edges`): a fractional scale there shifts which pixels are duplicated
   * on every frame, so edges and grid lines crawl and the motion reads as stutter.
   */
  settle?: boolean;
}

/**
 * Layers a still frame, painted by `paint`, directly above `target` (same size,
 * below any later siblings such as UI overlays). Works in popout windows.
 */
export function freezeCanvasFrame(
  target: HTMLCanvasElement,
  paint: (context: CanvasRenderingContext2D) => void,
  previous: SceneTransition | null,
  { settle: shouldSettle = true }: FreezeOptions = {},
): SceneTransition | null {
  const parent = target.parentElement;
  if (!parent || target.width === 0 || target.height === 0) return null;

  const snapshot = parent.createEl('canvas', { cls: 'atlas-scene-transition-snapshot' });
  const context = snapshot.getContext('2d');
  if (!context) {
    snapshot.remove();
    return null;
  }
  snapshot.width = target.width;
  snapshot.height = target.height;
  paint(context);
  previous?.paintInto(context);
  previous?.cancel();
  target.after(snapshot);

  let stop: (() => void) | null = null;

  const cancel = (): void => {
    const stopMotion = stop;
    stop = null;
    stopMotion?.();
    snapshot.remove();
    // Release the frame's pixels right away instead of waiting for garbage collection
    snapshot.width = 0;
    snapshot.height = 0;
  };

  return {
    play(motion: FrameMotion = crossfade(shouldSettle)): void {
      stop = motion(snapshot, target, cancel);
    },
    cancel,
    paintInto(into: CanvasRenderingContext2D): void {
      if (snapshot.isConnected) drawAsShown(into, snapshot);
    },
  };
}

/** The frame fades out while the new map settles in from a little closer. */
function crossfade(shouldSettle: boolean): FrameMotion {
  return (frame, target, done) => {
    const timing: KeyframeAnimationOptions = { duration: MOTION_SLOW_MS, easing: MOTION_EASE_OUT };
    const fade = frame.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: 'forwards' });
    fade.onfinish = done;
    const settle = shouldSettle && !prefersReducedMotion(target)
      ? target.animate([{ transform: `scale(${SETTLE_SCALE})` }, { transform: 'none' }], timing)
      : null;
    return (): void => {
      fade.cancel();
      settle?.cancel();
    };
  };
}

/**
 * Draws `element` into `context` as it shows right now: at its opacity and scaled about its centre,
 * so a transition interrupted halfway carries on from where it was instead of jumping.
 */
function drawAsShown(context: CanvasRenderingContext2D, element: HTMLCanvasElement): void {
  const style = element.win.getComputedStyle(element);
  // A computed scale is `matrix(a, 0, 0, a, 0, 0)`; anything else (`none`) is unscaled
  const scale = Number(/^matrix\(([^,]+),/.exec(style.transform)?.[1] ?? 1) || 1;
  const { width, height } = element;
  context.globalAlpha = Number(style.opacity);
  context.drawImage(element, (width * (1 - scale)) / 2, (height * (1 - scale)) / 2, width * scale, height * scale);
  context.globalAlpha = 1;
}
