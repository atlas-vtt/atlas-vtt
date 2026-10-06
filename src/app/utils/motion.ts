import { getDomHost } from '../host/dom';
/** Web Animations and canvas counterparts of the motion tokens in styles/_tokens.scss. */

/** `$transition-ease-out` as control points, for Motion's `ease` and `cubicBezier`. */
export const EASE_OUT_CONTROL_POINTS = [0.23, 1, 0.32, 1] as const;

/** `$transition-ease-out`: entering and leaving elements. */
export const MOTION_EASE_OUT = `cubic-bezier(${EASE_OUT_CONTROL_POINTS.join(', ')})`;
/** `$transition-fast` */
export const MOTION_FAST_MS = 100;
/** `$transition-normal` */
export const MOTION_NORMAL_MS = 200;
/** `$transition-slow` */
export const MOTION_SLOW_MS = 300;

/**
 * Panels and dialogs open by fading in while they rise and grow into place, and
 * close the same way in reverse, a little quicker and over a shorter distance.
 */
export const PANEL_ENTER_FROM = 'translateY(8px) scale(0.97)';
export const PANEL_EXIT_TO = 'translateY(4px) scale(0.98)';
export const PANEL_ENTER_MS = 220;
export const PANEL_EXIT_MS = 180;
/**
 * A popover anchored to something on the map grows out of it and shrinks back into it: the
 * same timing as a panel, scaled about the anchor (its `transform-origin`).
 */
export const POPOVER_ENTER_FROM = 'scale(0.9)';
export const POPOVER_EXIT_TO = 'scale(0.95)';
/** The dimmed backdrop behind a dialog fades in a little ahead of its window. */
export const BACKDROP_ENTER_MS = 200;

/** Whether the window `node` lives in (main or popout) asks for reduced motion. */
export function prefersReducedMotion(node: Node): boolean {
  return getDomHost().ownerWindow(node).matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of linear progress (0 to 1), for
 * animations drawn on a canvas. Solves the curve's x for the progress with Newton's
 * method, falling back to bisection where the slope is flat.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (progress: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number): number => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number): number => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number): number => (3 * ax * s + 2 * bx) * s + cx;
  const epsilon = 1e-6;

  const solveX = (x: number): number => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < epsilon) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < epsilon) break;
      s -= error / slope;
    }
    let low = 0;
    let high = 1;
    s = x;
    for (let i = 0; i < 64 && high - low > epsilon; i++) {
      if (sampleX(s) < x) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return s;
  };

  return (progress: number): number => {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    return sampleY(solveX(progress));
  };
}

/** `MOTION_EASE_OUT` for canvas animations. */
export const easeOut = cubicBezier(...EASE_OUT_CONTROL_POINTS);
