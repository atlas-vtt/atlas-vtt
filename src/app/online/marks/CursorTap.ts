import type { MarkPoint } from '../protocol/index.ts';
import { SpanMeter } from './SpanMeter.ts';
import { thinTrail, type TrailBatch } from './PointerTap.ts';

/** A pointer event on the map's canvas: where it is on the canvas, in CSS pixels, and what kind of pointer it is. */
export type CursorEvent = Pick<PointerEvent, 'offsetX' | 'offsetY' | 'pointerType'>;

/** The map's canvas, whose pointer events the tap follows. */
export interface CursorCanvas {
  addEventListener(type: 'pointermove' | 'pointerdown', listener: (event: CursorEvent) => void): void;
  addEventListener(type: 'mouseleave', listener: () => void): void;
  removeEventListener(type: 'pointermove' | 'pointerdown', listener: (event: CursorEvent) => void): void;
  removeEventListener(type: 'mouseleave', listener: () => void): void;
}

/** What the tap reads the world from: a pixi-viewport (any copy of PIXI), whose camera moves the map under a pointer at rest. */
export interface CursorViewport {
  on(event: 'moved' | 'zoomed', listener: () => void): unknown;
  off(event: 'moved' | 'zoomed', listener: () => void): unknown;
  toWorld(point: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number };
  readonly scale: { readonly x: number };
}

/** Someone's own cursor over a map: where it is, the places it passed since it was last asked, and when it last moved. */
export interface CursorSource {
  /** The pointer over the map, or null while it is elsewhere. */
  at(): MarkPoint | null;
  /**
   * When its owner last moved the pointer or the map under it (a scroll or zoom that leaves the
   * pointer on the same place still counts: they are at work), on the tap's clock; null while it is away.
   */
  movedAt(): number | null;
  /** The places passed since the last call (at most `max` numbers, `thinTrail`) and the time they cover, as a laser tells it. */
  take(max: number): TrailBatch;
  /** Calls `listener` whenever the pointer or the map under it moved, or the pointer came or left; returns the function that stops it. */
  subscribe(listener: () => void): () => void;
}

/** Closest two places of a path may be, in screen pixels: closer ones add nothing a receiver could show. */
const MIN_SPACING_PX = 2;
/** The most places kept between two calls of `take`. */
const MAX_PENDING = 64;

const rounded = (value: number): number => Math.round(value * 10) / 10;

/**
 * The cursor of a map's viewport, as everyone else at the table is to see it: every move of a mouse
 * or pen over the map, in world coordinates, whatever the tool and the buttons, and every pan or
 * zoom that moves the map under it. A finger has no cursor, so touch is left out. It only listens and
 * stops nothing.
 *
 * The pointer's place on the canvas comes from the canvas's own pointer events, and its place in the
 * world is worked out in a task of its own after the event that moved the pointer or the camera
 * (`defer`): a drag moves the camera inside the very pointer event that moves the pointer, in PIXI's
 * listener on the document, which runs before the canvas hears of the move. A place worked out in
 * between, even in a microtask after that listener, pairs the new camera with the pointer of the
 * move before, one drag step off, and every other place sent then zigzagged on everyone else's map.
 */
export class CursorTap implements CursorSource {
  private readonly viewport: CursorViewport;
  private readonly canvas: CursorCanvas;
  private readonly now: () => number;
  private readonly defer: (run: () => void) => void;
  private readonly listeners = new Set<() => void>();
  private readonly meter = new SpanMeter();
  private pointer: MarkPoint | null = null;
  /** Where the pointer is on the canvas, while it is over the map. */
  private screen: { readonly x: number; readonly y: number } | null = null;
  private moved: number | null = null;
  private pending: number[] = [];
  private sampling = false;
  private readonly onMove = (event: CursorEvent): void => this.track(event);
  private readonly onCamera = (): void => this.sample();
  private readonly onLeave = (): void => this.leave();

  /**
   * `now` is the clock spans and rests are measured on, in ms; `defer` runs work in a task after the
   * one under way, once every listener of the event that started it has run.
   */
  constructor(viewport: CursorViewport, canvas: CursorCanvas, now: () => number = () => performance.now(), defer: (run: () => void) => void = (run) => void window.setTimeout(run, 0)) {
    this.viewport = viewport;
    this.canvas = canvas;
    this.now = now;
    this.defer = defer;
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onMove);
    viewport.on('moved', this.onCamera);
    viewport.on('zoomed', this.onCamera);
    canvas.addEventListener('mouseleave', this.onLeave);
  }

  at(): MarkPoint | null {
    return this.pointer;
  }

  movedAt(): number | null {
    return this.pointer === null ? null : this.moved;
  }

  take(max: number): TrailBatch {
    const pts = thinTrail(this.pending, max);
    this.pending = [];
    const span = this.meter.take();
    return span === undefined ? { pts } : { pts, span };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onMove);
    this.viewport.off('moved', this.onCamera);
    this.viewport.off('zoomed', this.onCamera);
    this.canvas.removeEventListener('mouseleave', this.onLeave);
    this.listeners.clear();
  }

  private track(event: CursorEvent): void {
    if (event.pointerType === 'touch') return;
    this.screen = { x: event.offsetX, y: event.offsetY };
    this.sample();
  }

  /** Works out the pointer's place in the world in a task after the event under way. */
  private sample(): void {
    if (this.sampling || this.screen === null) return;
    this.sampling = true;
    this.defer(() => {
      this.sampling = false;
      if (this.screen !== null) this.place(this.screen);
    });
  }

  /** The pointer is at `screen` on the canvas: where that is in the world, if it moved there. */
  private place(screen: { readonly x: number; readonly y: number }): void {
    const world = this.viewport.toWorld(screen);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return;
    const at: MarkPoint = [rounded(world.x), rounded(world.y)];
    const { pointer } = this;
    const now = this.now();
    this.moved = now;
    if (pointer !== null && pointer[0] === at[0] && pointer[1] === at[1]) {
      this.changed();
      return;
    }
    // A pointer that comes back starts a path of its own: its first message tells no span.
    if (pointer === null) this.meter.reset();
    this.meter.moved(now);
    this.pointer = at;
    this.addPlace(at);
    this.changed();
  }

  private leave(): void {
    this.screen = null;
    if (this.pointer === null) return;
    // The places passed on the way out still go: a receiver plays the path up to the edge.
    this.pointer = null;
    this.changed();
  }

  private addPlace([x, y]: MarkPoint): void {
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
