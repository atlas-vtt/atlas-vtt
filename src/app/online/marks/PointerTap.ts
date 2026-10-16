import type { LaserState, MarkPoint } from '../protocol/index.ts';
import { SpanMeter } from './SpanMeter.ts';

/** A pointer event as a viewport sends it: the button and where it is on the canvas. */
export type TapEvent = { readonly button: number } & Readonly<Record<'global', { readonly x: number; readonly y: number }>>;

type TapEventName = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerupoutside';

/** What the tap listens to: a pixi-viewport (any copy of PIXI) and where its world is. */
export interface TapViewport {
  on(event: TapEventName, listener: (event: TapEvent) => void): unknown;
  off(event: TapEventName, listener: (event: TapEvent) => void): unknown;
  toWorld(point: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number };
  readonly scale: { readonly x: number };
}

/** A press of the primary button on the map: counted, so each press tells a new measurement from the last. */
export interface Press {
  readonly serial: number;
  readonly at: MarkPoint;
}

/**
 * What a laser drew since it was last asked: its trail points (x, y flat, oldest first) and the time
 * they cover, as a laser message tells it (`LaserState.span`): whole milliseconds from the pointer's
 * place the last take ended on to where it is now. No span before the pointer was seen twice.
 */
export interface TrailBatch {
  readonly pts: number[];
  readonly span?: number;
}

/** Where a laser is and what it drew since it was last asked, and the last press on the map. */
export interface LaserSource {
  /** The pointer while the laser shows it, and whether it draws. */
  state(): Pick<LaserState, 'at' | 'on'>;
  /** The trail drawn since the last call, at most `max` numbers of it (`thinTrail`). */
  takeTrail(max: number): TrailBatch;
  lastPress(): Press | null;
  /** Calls `listener` whenever any of that changed; returns the function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** Closest two trail points may be, in screen pixels: closer ones are hand jitter. */
const MIN_SPACING_PX = 3;
/** The most trail points kept between two calls of `takeTrail`. */
const MAX_PENDING = 100;

const rounded = (value: number): number => Math.round(value * 10) / 10;

/**
 * At most `max` numbers of a trail (x, y pairs, oldest first): all of it while it fits, else pairs
 * spread evenly along it up to the newest, so a fast stroke keeps its whole way, only coarser.
 */
export function thinTrail(pts: readonly number[], max: number): number[] {
  const pairs = Math.floor(pts.length / 2);
  const keep = Math.floor(max / 2);
  if (pairs <= keep) return pts.slice(0, pairs * 2);
  const thinned: number[] = [];
  for (let index = 1; index <= keep; index += 1) {
    const pair = Math.round((index * pairs) / keep) - 1;
    thinned.push(pts[2 * pair] ?? 0, pts[2 * pair + 1] ?? 0);
  }
  return thinned;
}

/**
 * The laser of a map's viewport by Atlas's two rules: the primary button draws while the Laser tool
 * is active, the middle button draws in any tool. It only listens and stops nothing, so it can follow
 * Atlas's own laser on the GM's canvas as well as the player's.
 */
export class PointerTap implements LaserSource {
  private readonly viewport: TapViewport;
  private readonly canvas: EventTarget;
  private readonly isLaser: () => boolean;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private pointer: MarkPoint | null = null;
  private readonly meter = new SpanMeter();
  private pointing = false;
  private quick = false;
  private pending: number[] = [];
  private press: Press | null = null;
  private readonly onDown = (event: TapEvent): void => this.down(event);
  private readonly onMove = (event: TapEvent): void => this.move(event);
  private readonly onUp = (event: TapEvent): void => this.up(event.button);
  private readonly onUpOutside = (): void => this.up(null);
  private readonly onLeave = (): void => {
    this.pointer = null;
    this.changed();
  };

  /** `now` is the clock the spans are measured on, in ms. */
  constructor(viewport: TapViewport, canvas: EventTarget, isLaser: () => boolean, now: () => number = () => performance.now()) {
    this.viewport = viewport;
    this.canvas = canvas;
    this.isLaser = isLaser;
    this.now = now;
    viewport.on('pointerdown', this.onDown);
    viewport.on('pointermove', this.onMove);
    viewport.on('pointerup', this.onUp);
    viewport.on('pointerupoutside', this.onUpOutside);
    canvas.addEventListener('mouseleave', this.onLeave);
  }

  state(): Pick<LaserState, 'at' | 'on'> {
    const shows = this.pointing || this.quick || this.isLaser();
    return { at: shows ? this.pointer : null, on: this.pointing };
  }

  takeTrail(max: number): TrailBatch {
    const pts = thinTrail(this.pending, max);
    this.pending = [];
    const span = this.meter.take();
    return span === undefined ? { pts } : { pts, span };
  }

  lastPress(): Press | null {
    return this.press;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.viewport.off('pointerdown', this.onDown);
    this.viewport.off('pointermove', this.onMove);
    this.viewport.off('pointerup', this.onUp);
    this.viewport.off('pointerupoutside', this.onUpOutside);
    this.canvas.removeEventListener('mouseleave', this.onLeave);
    this.listeners.clear();
  }

  private down(event: TapEvent): void {
    const at = this.track(event);
    if (event.button === 0 && at !== null) this.press = { serial: (this.press?.serial ?? 0) + 1, at };
    const quick = event.button === 1;
    if (!quick && !(event.button === 0 && this.isLaser())) return;
    this.quick ||= quick;
    this.pointing = true;
    if (at !== null) this.addPoint(at);
    this.changed();
  }

  private move(event: TapEvent): void {
    const at = this.track(event);
    if (at === null) return;
    if (this.pointing) this.addPoint(at);
    if (this.pointing || this.quick || this.isLaser()) this.changed();
  }

  /** The middle button ends quick pointing, the primary button the Laser tool's; `null` (released off the canvas) ends both. */
  private up(button: number | null): void {
    if (button === null || (button === 1 && this.quick)) this.quick = false;
    else if (!(button === 0 && this.pointing && this.isLaser())) return;
    this.pointing = this.quick;
    this.changed();
  }

  private track(event: TapEvent): MarkPoint | null {
    const world = this.viewport.toWorld(event.global);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return null;
    const at: MarkPoint = [rounded(world.x), rounded(world.y)];
    const { pointer } = this;
    // Time counts only for a pointer that is somewhere else: a message that tells a span has a new place to go with it.
    if (pointer === null || pointer[0] !== at[0] || pointer[1] !== at[1]) this.meter.moved(this.now());
    this.pointer = at;
    return at;
  }

  private addPoint([x, y]: MarkPoint): void {
    const lastX = this.pending.at(-2);
    const lastY = this.pending.at(-1);
    const gap = MIN_SPACING_PX / (this.viewport.scale.x || 1);
    if (lastX !== undefined && lastY !== undefined && Math.hypot(x - lastX, y - lastY) < gap) return;
    this.pending.push(x, y);
    if (this.pending.length > MAX_PENDING * 2) this.pending.splice(0, this.pending.length - MAX_PENDING * 2);
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
