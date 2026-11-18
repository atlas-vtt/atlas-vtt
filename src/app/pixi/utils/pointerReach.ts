import { lastPointerWasTouch } from '../../packages/components/primitives/lastInput';

/** A pointer event, as far as its kind goes. */
export interface PointerKindSource {
  readonly pointerType?: string;
}

/**
 * What a reach on the map that is sized for a mouse is multiplied by under a finger: a finger
 * needs a target 44 points across (Apple's guidelines), where Atlas' handles are about 22 px.
 */
export const FINGER_REACH_SCALE = 2;

/** How far a finger may wander and still rest (px); past it the press is a drag. A mouse and a pen hold still within less. */
export const FINGER_SLOP_PX = 8;

/** How far apart the two taps of a finger's double tap may land (px). */
export const FINGER_DOUBLE_TAP_PX = 40;

/** Half of what a finger needs on screen (px): the least a round target reaches from its middle under one. */
export const FINGER_TARGET_RADIUS = 22;

/**
 * Whether a finger is what points: the event's own kind where the caller has one, else the
 * pointer last used in a window Atlas watches. So a mouse attached to a tablet keeps a mouse's
 * reach and a finger on a touch laptop gets a finger's. Reads no media query: asked on every move.
 */
export function isFinger(pointer?: PointerKindSource | null): boolean {
  const type = pointer?.pointerType;
  return type ? type === 'touch' : lastPointerWasTouch();
}

let fineOnly = 0;

/**
 * Runs `run` with a mouse's reach whatever points: for a finger's press that lies on something
 * (a token) which a wider reach of the marks beside it would take the press from.
 */
export function withFineReach<T>(run: () => T): T {
  fineOnly++;
  try {
    return run();
  } finally {
    fineOnly--;
  }
}

/** Whether what is pressed is reached as a finger reaches it: further than a mouse, and of several things in reach the nearest. */
export function fingerReaches(pointer?: PointerKindSource | null): boolean {
  return fineOnly === 0 && isFinger(pointer);
}

/** A reach of `px` screen pixels for a mouse, as the pointer in use has it. */
export function pointerReach(px: number, pointer?: PointerKindSource | null): number {
  return fingerReaches(pointer) ? px * FINGER_REACH_SCALE : px;
}

/**
 * Which of the things within a pointer's reach a press takes: a mouse the first in the order they
 * are offered, as it always did; a finger, whose wider reach takes in neighbours, the nearest of
 * them. Kept by whoever hit-tests and begun anew for every test, so a test allocates nothing.
 */
export class ReachPick<T> {
  private best = 0;
  private within = true;
  private nearest = false;
  private picked: T | null = null;
  private done = false;

  /**
   * Starts a search within `reach`, in the measure the distances are offered in (a squared reach
   * for squared distances). What lies exactly `reach` away is in it, unless `within` is false.
   */
  begin(reach: number, within = true): this {
    this.best = reach;
    this.within = within;
    this.nearest = fingerReaches();
    this.picked = null;
    this.done = false;
    return this;
  }

  /** Offers what lies `distance` from the point; returns whether it is taken. */
  offer(candidate: T, distance: number): boolean {
    if (this.within ? distance > this.best : distance >= this.best) return false;
    this.picked = candidate;
    if (this.nearest) this.best = distance;
    else this.done = true;
    return true;
  }

  /** Nothing offered from here on is taken: a mouse has the first thing it reached. */
  get over(): boolean {
    return this.done;
  }

  get taken(): T | null {
    return this.picked;
  }
}

/** How far a press moves before it is a drag: `px` screen pixels for a mouse or a pen, never less than a finger's slop for a finger. */
export function dragThreshold(px: number, pointer?: PointerKindSource | null): number {
  return isFinger(pointer) ? Math.max(px, FINGER_SLOP_PX) : px;
}

/** World pixels a mouse travels before the tokens it holds are dragged. */
const TOKEN_DRAG_DISTANCE = 5;

/** World pixels a press travels in `view` before the tokens it holds are dragged: under a finger never less than its slop on screen. The view's zoom is read for a finger alone. */
export function tokenDragDistance(view: { readonly scale: { readonly x: number } }, pointer?: PointerKindSource | null): number {
  if (!isFinger(pointer)) return TOKEN_DRAG_DISTANCE;
  const zoom = view.scale.x;
  return Math.max(TOKEN_DRAG_DISTANCE, FINGER_SLOP_PX / (zoom > 0 ? zoom : 1));
}

/** How far apart the two presses of a double click may land: `px` screen pixels for a mouse or a pen; a finger's two taps lie further apart. */
export function doubleClickSlack(px: number, pointer?: PointerKindSource | null): number {
  return isFinger(pointer) ? Math.max(px, FINGER_DOUBLE_TAP_PX) : px;
}
