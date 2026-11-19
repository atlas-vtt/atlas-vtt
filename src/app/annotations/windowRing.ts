/**
 * One ring of a fill as a window sees it (`fillWindowCut.ts`): the parts of it inside the window,
 * on the clipping grid, and the stretches of it that run outside, kept as they are.
 *
 * The ring's stand-in inside the window is a closed curve of the parts inside, each joined to the
 * next along the window's edge. Which way round the edge decides what the curve winds around, so
 * it goes the way the stretch outside went: that is told by how often the stretch crossed a ray
 * from the window's middle, counted with its direction.
 */

import { Q_SCALE } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { windingNumber } from './lineMath';

/** One number for a point of the clipping grid. */
export const pointKey = (x: number, y: number): number => (x + 2 ** 25) * 2 ** 27 + (y + 2 ** 25);

/** The window: a box of the clipping grid (capitals) and of the world (small letters), and a point in its middle. */
export interface CutWindow {
  readonly X0: number;
  readonly Y0: number;
  readonly X1: number;
  readonly Y1: number;
  readonly CX: number;
  readonly CY: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly cx: number;
  readonly cy: number;
}

/** A stretch of a ring outside the window, between the two points where the ring crosses the window's edge. */
export interface Stretch {
  /** Where it leaves the window, and where it comes back (`pointKey`). */
  readonly from: number;
  readonly to: number;
  /** The ring's own points between the two, in the ring's direction. */
  readonly points: Point[];
}

export type WalkedRing =
  /** No part of the ring is in the window; `around` where it winds around the window. */
  | { readonly kind: 'beyond'; readonly around: boolean }
  /** All of the ring is in the window: `curve` is the ring on the clipping grid. */
  | { readonly kind: 'within'; readonly curve: number[] }
  | { readonly kind: 'crossing'; readonly curve: number[]; readonly stretches: Stretch[] };

/** A stretch while it is walked. */
interface OpenStretch {
  /** Where it left the window, on the clipping grid; null for the stretch the walk began in. */
  from: readonly [number, number] | null;
  points: Point[];
  /** How often it crossed the ray, counted with its direction. */
  turns: number;
}

/** The part of a ring inside the window before a stretch, and the stretch. */
interface Lap {
  readonly inside: number[];
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly points: Point[];
  readonly turns: number;
}

export class WindowRing {
  /** The four corners by how far along the window's edge they lie (`along`). */
  private readonly corners: readonly (readonly [number, number, number])[];
  private readonly round: number;

  constructor(private readonly win: CutWindow) {
    const { X0, Y0, X1, Y1, CY } = win;
    const width = X1 - X0;
    const height = Y1 - Y0;
    const first = Y1 - CY;
    this.corners = [[first, X1, Y1], [first + width, X0, Y1], [first + width + height, X0, Y0], [first + 2 * width + height, X1, Y0]];
    this.round = 2 * width + 2 * height;
  }

  /** The ring through the first `count` of `ring`'s points as the window sees it; null where it fits no rule. */
  of(ring: readonly Point[], count: number): WalkedRing | null {
    const start = this.firstOutside(ring, count);
    if (start === 'beyond') return { kind: 'beyond', around: this.around(ring) };
    if (start === 'within') {
      const curve: number[] = [];
      for (let i = 0; i < count; i++) curve.push(Math.round(ring[i]!.x * Q_SCALE), Math.round(ring[i]!.y * Q_SCALE));
      return { kind: 'within', curve };
    }
    const laps = this.laps(ring, count, start);
    return laps && this.curveOf(laps);
  }

  private code(point: Point): number {
    const { x0, y0, x1, y1 } = this.win;
    return (point.x < x0 ? 1 : point.x > x1 ? 2 : 0) | (point.y < y0 ? 4 : point.y > y1 ? 8 : 0);
  }

  /** Whether the ring winds around the window: asked of one that has no part in it. */
  private around(ring: readonly Point[]): boolean {
    return windingNumber({ x: this.win.cx, y: this.win.cy }, ring) !== 0;
  }

  /** A point of the ring outside the window to begin at; or that the ring has no part in the window, or lies in it whole. */
  private firstOutside(ring: readonly Point[], count: number): number | 'beyond' | 'within' {
    let outside = -1;
    let touches = false;
    let before = this.code(ring[count - 1]!);
    for (let i = 0; i < count; i++) {
      const code = this.code(ring[i]!);
      if (code !== 0 && outside < 0) outside = i;
      touches ||= code === 0 || ((code & before) === 0 && before !== 0 && this.span(ring[(i + count - 1) % count]!, ring[i]!) !== null);
      before = code;
    }
    if (outside < 0) return 'within';
    return touches ? outside : 'beyond';
  }

  /** The stretch of the segment a–b inside the window, as shares of it; null for none or for a single point. */
  private span(a: Point, b: Point): readonly [number, number] | null {
    const { x0, y0, x1, y1 } = this.win;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let from = 0;
    let to = 1;
    const sides = [-dx, a.x - x0, dx, x1 - a.x, -dy, a.y - y0, dy, y1 - a.y];
    for (let i = 0; i < 8; i += 2) {
      const p = sides[i]!;
      const q = sides[i + 1]!;
      if (p === 0) {
        if (q < 0) return null;
      } else if (p < 0) from = Math.max(from, q / p);
      else to = Math.min(to, q / p);
    }
    return from < to ? [from, to] : null;
  }

  /** The point at share `t` of a–b, on the clipping grid and in the window. */
  private at(a: Point, b: Point, t: number): readonly [number, number] {
    const { X0, Y0, X1, Y1 } = this.win;
    const x = Math.round((a.x + (b.x - a.x) * t) * Q_SCALE);
    const y = Math.round((a.y + (b.y - a.y) * t) * Q_SCALE);
    return [Math.min(X1, Math.max(X0, x)), Math.min(Y1, Math.max(Y0, y))];
  }

  /** How the way from (ax, ay) to (bx, by) crosses the ray from the window's middle towards greater x: 1 towards greater y, −1 back, 0 for not at all. */
  private turn(ax: number, ay: number, bx: number, by: number): number {
    const { cx, cy } = this.win;
    const below = by >= cy;
    if ((ay >= cy) === below) return 0;
    return ax + ((cy - ay) * (bx - ax)) / (by - ay) > cx ? (below ? 1 : -1) : 0;
  }

  /** Walks the ring from `start` (a point outside the window) once round: its parts inside, each with the stretch that follows it. */
  private laps(ring: readonly Point[], count: number, start: number): Lap[] | null {
    const laps: Lap[] = [];
    const first: OpenStretch = { from: null, points: [], turns: 0 };
    let stretch = first;
    let firstTo: readonly [number, number] | null = null;
    let inside: number[] | null = null;
    const enter = (a: Point, at: readonly [number, number]): void => {
      stretch.turns += this.turn(a.x, a.y, at[0] / Q_SCALE, at[1] / Q_SCALE);
      if (stretch.from === null) firstTo = at;
      else laps[laps.length - 1] = { ...laps[laps.length - 1]!, to: at, points: stretch.points, turns: stretch.turns };
      inside = [at[0], at[1]];
    };
    const leave = (b: Point, at: readonly [number, number]): void => {
      inside!.push(at[0], at[1]);
      stretch = { from: at, points: [b], turns: this.turn(at[0] / Q_SCALE, at[1] / Q_SCALE, b.x, b.y) };
      laps.push({ inside: inside!, from: at, to: at, points: stretch.points, turns: 0 });
      inside = null;
    };
    let a = ring[start]!;
    let codeA = this.code(a);
    for (let step = 1; step <= count; step++) {
      const b = ring[(start + step) % count]!;
      const codeB = this.code(b);
      if (codeA === 0 && codeB === 0) inside!.push(Math.round(b.x * Q_SCALE), Math.round(b.y * Q_SCALE));
      else if (codeA === 0) leave(b, this.at(a, b, this.span(a, b)?.[1] ?? 0));
      else if (codeB === 0) {
        enter(a, this.at(a, b, this.span(a, b)?.[0] ?? 1));
        inside!.push(Math.round(b.x * Q_SCALE), Math.round(b.y * Q_SCALE));
      } else {
        const span = (codeA & codeB) === 0 ? this.span(a, b) : null;
        if (span) {
          enter(a, this.at(a, b, span[0]));
          leave(b, this.at(a, b, span[1]));
        } else {
          stretch.turns += this.turn(a.x, a.y, b.x, b.y);
          stretch.points.push(b);
        }
      }
      a = b;
      codeA = codeB;
    }
    // Back where the walk began: the stretch walked last runs on into the one walked first.
    const last = laps[laps.length - 1];
    if (!last || !firstTo || stretch === first) return null;
    laps[laps.length - 1] = { ...last, to: firstTo, points: [...stretch.points, ...first.points], turns: stretch.turns + first.turns };
    return laps;
  }

  /** How far along the window's edge a point of it lies, from where the ray leaves the window and towards greater y first; null for a point not on the edge. */
  private along([x, y]: readonly [number, number]): number | null {
    const { X0, Y0, X1, Y1, CY } = this.win;
    const first = Y1 - CY;
    const width = X1 - X0;
    const height = Y1 - Y0;
    if (x === X1 && y >= CY) return y - CY;
    if (y === Y1) return first + (X1 - x);
    if (x === X0) return first + width + (Y1 - y);
    if (y === Y0) return first + width + height + (x - X0);
    if (x === X1) return first + 2 * width + height + (y - Y0);
    return null;
  }

  /** The window's corners on the way along its edge from `from` to `to`, forward (the way `along` grows) or back; `wraps` where the way passes where `along` begins. */
  private cornersBetween(from: number, to: number, forward: boolean, wraps: boolean, into: number[]): void {
    const passed = this.corners.filter(([at]) => (forward
      ? (wraps ? at > from || at < to : at > from && at < to)
      : (wraps ? at < from || at > to : at < from && at > to)));
    // Forward and wrapping, the corners past `from` come before those before `to`; back, the other way round.
    const order = (at: number): number => (forward ? (at > from ? at : at + this.round) : (at < from ? -at : this.round - at));
    passed.sort((one, other) => order(one[0]) - order(other[0]));
    for (const [, x, y] of passed) into.push(x, y);
  }

  private curveOf(laps: readonly Lap[]): WalkedRing | null {
    const curve: number[] = [];
    const stretches: Stretch[] = [];
    for (const lap of laps) {
      for (const coordinate of lap.inside) curve.push(coordinate);
      const from = this.along(lap.from);
      const to = this.along(lap.to);
      if (from === null || to === null) return null;
      // Going forward from `from` to `to` crosses the ray once exactly where `to` lies before `from`.
      const forwardTurns = to >= from ? 0 : 1;
      if (lap.turns !== forwardTurns && lap.turns !== forwardTurns - 1) return null;
      const forward = lap.turns === forwardTurns;
      this.cornersBetween(from, to, forward, forward ? to < from : to >= from, curve);
      stretches.push({ from: pointKey(lap.from[0], lap.from[1]), to: pointKey(lap.to[0], lap.to[1]), points: lap.points });
    }
    return { kind: 'crossing', curve, stretches };
  }
}
