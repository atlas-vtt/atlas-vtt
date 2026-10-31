import { CURSOR_REST_MS, GM_MARKS, playerTone, type SharedCursor } from '../protocol/index.ts';
import { getDomHost } from '../../host/dom';
import { PointerTrack, type TrackPoint } from './PointerTrack.ts';

/** Where the world is on screen: the map's camera, in CSS pixels of the layer. */
export interface CursorCamera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** How long a cursor takes to fade in or out, in ms (the stylesheet's transition: `_cursors.scss`). */
export const CURSOR_FADE_MS = 160;
/**
 * A cursor nothing named for this long goes: the GM names every cursor it shows at least every
 * `CURSOR_KEEPALIVE_MS`, so only a GM that went silent (a lost connection) leaves one this long.
 */
export const CURSOR_STALE_MS = 2 * CURSOR_REST_MS;

interface Cursor {
  readonly element: HTMLDivElement;
  readonly label: HTMLDivElement;
  readonly track: PointerTrack;
  /** The newest place the track was given; null while the pointer is away. */
  newest: TrackPoint | null;
  /** Whether the last update named it. */
  present: boolean;
  /** When an update last named it. */
  heardAt: number;
  /** Since when it fades out to go; null while it stays. */
  leaving: number | null;
  shown: boolean;
  /** The transform last written, so a cursor at rest writes nothing. */
  transform: string;
}

/** The colour class of a cursor (`_player-colours.scss`). */
const colourClass = (who: string): string => `atlas-online-colour-${who === GM_MARKS ? 'gm' : String(playerTone(who))}`;

/** The places a cursor's message adds: those it passed, then the pointer where it is not the last of them. */
function placesOf(cursor: SharedCursor, newest: TrackPoint | null): TrackPoint[] {
  const places: TrackPoint[] = [];
  for (let index = 0; index + 1 < cursor.pts.length; index += 2) places.push({ x: cursor.pts[index] ?? 0, y: cursor.pts[index + 1] ?? 0 });
  if (cursor.at === null) return places;
  const [x, y] = cursor.at;
  const last = places.at(-1) ?? newest;
  if (last === null || last.x !== x || last.y !== y) places.push({ x, y });
  return places;
}

/**
 * A length in CSS pixels on the device pixel grid (`ratio` device pixels a CSS pixel), so text at rest
 * stays sharp; unsnapped (`ratio` null) to a hundredth, so a cursor moving with a map that moves in
 * fractions of a pixel keeps its place on the map instead of stepping against it.
 */
const onPixels = (value: number, ratio: number | null): number => (ratio === null ? Math.round(value * 100) / 100 : Math.round(value * ratio) / ratio);

/**
 * Other people's cursors over a map, as elements of a layer laid over it: an arrow and a name tag in
 * the owner's colour, the same size at every zoom. Each is drawn from a `PointerTrack`, a moment
 * behind its messages, so it moves on every display frame as its owner's hand did. One that comes
 * fades in; one that leaves the map, or is no longer named, plays out what it sent and fades away.
 */
export class RemoteCursors {
  private readonly layer: HTMLElement;
  private readonly labelOf: (cursor: SharedCursor) => string;
  private readonly interval: number;
  private readonly cursors = new Map<string, Cursor>();

  /** `labelOf` names a cursor's tag; `interval` is the senders' send interval, in ms. */
  constructor(layer: HTMLElement, labelOf: (cursor: SharedCursor) => string, interval: number) {
    this.layer = layer;
    this.labelOf = labelOf;
    this.interval = interval;
  }

  /** Every cursor as it is now, with the places it passed since the last update (`now` in ms, the clock `tick` runs on). */
  update(cursors: readonly SharedCursor[], now: number): void {
    const present = new Set(cursors.map((cursor) => cursor.who));
    for (const [who, cursor] of this.cursors) if (!present.has(who)) this.leave(cursor);
    for (const shared of cursors) {
      const cursor = this.cursors.get(shared.who) ?? this.add(shared.who);
      const places = placesOf(shared, cursor.newest);
      cursor.track.push(places, shared.span, now);
      cursor.newest = places.at(-1) ?? cursor.newest;
      cursor.heardAt = now;
      cursor.present = true;
      cursor.leaving = null;
      const label = this.labelOf(shared);
      if (cursor.label.textContent !== label) cursor.label.textContent = label;
      if (shared.at === null) this.leave(cursor);
    }
  }

  /** How far `who`'s cursor is drawn behind its messages at `now` (`PointerTrack.lag`), or null once it has nothing left to draw. */
  lagOf(who: string, now: number): number | null {
    const cursor = this.cursors.get(who);
    return cursor === undefined || (!cursor.present && !cursor.track.busy(now)) ? null : cursor.track.lag(now);
  }

  /** How many cursors are drawn or fading. */
  get size(): number {
    return this.cursors.size;
  }

  /**
   * Draws every cursor as it is at `now` under `camera`; one that has faded out goes. A cursor at rest
   * under a `settled` camera lies on the device's pixels (`ratio` device pixels a CSS pixel); one that
   * moves, or whose map moves, lies where it falls.
   */
  tick(now: number, camera: CursorCamera, ratio: number, settled: boolean): void {
    for (const [who, cursor] of this.cursors) {
      if (cursor.present && now - cursor.heardAt >= CURSOR_STALE_MS) this.leave(cursor);
      const at = cursor.track.at(now);
      const playing = cursor.track.busy(now);
      if (!cursor.present && !playing) cursor.leaving ??= now;
      if (cursor.leaving !== null && now - cursor.leaving >= CURSOR_FADE_MS) {
        this.remove(who, cursor);
        continue;
      }
      this.setShown(cursor, at !== null && cursor.leaving === null);
      if (at === null) continue;
      const snap = settled && !playing ? ratio : null;
      const x = onPixels(at.x * camera.scale + camera.x, snap);
      const y = onPixels(at.y * camera.scale + camera.y, snap);
      const transform = `translate3d(${x}px, ${y}px, 0)`;
      if (transform !== cursor.transform) {
        cursor.element.style.transform = transform;
        cursor.transform = transform;
      }
    }
  }

  clear(): void {
    for (const [who, cursor] of this.cursors) this.remove(who, cursor);
  }

  /** The cursor is no longer named, or its pointer left the map: what it sent is still played, then it fades. */
  private leave(cursor: Cursor): void {
    cursor.present = false;
    cursor.newest = null;
    cursor.track.end();
  }

  private setShown(cursor: Cursor, shown: boolean): void {
    if (cursor.shown === shown) return;
    cursor.shown = shown;
    cursor.element.classList.toggle('is-shown', shown);
  }

  private add(who: string): Cursor {
    const element = getDomHost().createDiv(this.layer, `atlas-online-cursor ${colourClass(who)}`);
    const body = getDomHost().createDiv(element, 'atlas-online-cursor__body');
    getDomHost().createDiv(body, 'atlas-online-cursor__arrow');
    const label = getDomHost().createDiv(body, 'atlas-online-cursor__label');
    const cursor: Cursor = { element, label, track: new PointerTrack({ interval: this.interval }), newest: null, present: false, heardAt: Number.NEGATIVE_INFINITY, leaving: null, shown: false, transform: '' };
    this.cursors.set(who, cursor);
    return cursor;
  }

  private remove(who: string, cursor: Cursor): void {
    this.cursors.delete(who);
    cursor.element.remove();
  }
}
