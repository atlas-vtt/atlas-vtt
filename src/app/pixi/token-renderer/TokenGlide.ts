import { UPDATE_PRIORITY, type Container, type Ticker } from 'pixi.js';
import { ShownPlaces } from '../../lighting/shownPlaces';
import { PointerTrack } from '../../online/marks/PointerTrack';

interface Point {
  readonly x: number;
  readonly y: number;
}

/** How quickly a token glides to its place: about a third of the way is left after 50 ms. */
const GLIDE_MS = 50;
/** Closer than this, in world pixels, a token is there. */
const ARRIVED = 0.05;

/** Where a glide from `from` towards `to` is `elapsedMs` later; `to` itself once it has arrived. */
export function glideStep(from: Point, to: Point, elapsedMs: number): Point {
  const left = Math.exp(-elapsedMs / GLIDE_MS);
  const dx = (to.x - from.x) * left;
  const dy = (to.y - from.y) * left;
  if (Math.abs(dx) < ARRIVED && Math.abs(dy) < ARRIVED) return to;
  return { x: to.x - dx, y: to.y - dy };
}

/** What decides how a move the store made is shown. */
export interface StoreMove {
  /** The store notes the token as held (`heldTokens`). */
  held: boolean;
  /** This view's own pointer is dragging tokens. */
  pointerDrags: boolean;
  /** The map is loading. */
  loading: boolean;
  /** The move may be shown on its way (`TokenRenderer.mayGlide`). */
  mayGlide: boolean;
}

/**
 * Whether a move the store made is put in its place at once instead of glided. A token this view's
 * own pointer drags is drawn by that drag; a load shows the scene as it is; a move that may not be
 * shown on its way never is. A token held by someone else moves on its way (`follow`): a player
 * dragging it online only sends places, bunched by the network, and nothing here draws the way between.
 */
export function placedAtOnce({ held, pointerDrags, loading, mayGlide }: StoreMove): boolean {
  return (held && pointerDrags) || loading || !mayGlide;
}

/**
 * How tokens someone else holds are drawn (a player's drag followed online): from a playout of the
 * places the store is given, a little behind them, as the cursor of the pointer that holds them.
 */
export interface HeldPlayout {
  /** The nominal time between two places of a held token, in ms. */
  readonly interval: number;
  /** How far behind its messages the cursor of the pointer holding a token is drawn now (`PointerTrack.lag`), or null while none shows. */
  lag(tokenId: string): number | null;
}

/** Who holds a token: this view's own pointer, someone else, or nobody. */
export type TokenHolder = 'pointer' | 'elsewhere' | null;

/** A held token's playout: its places, the last one given, where it ends once let go of, and its holder's cursor lag last read. */
interface Follow {
  readonly track: PointerTrack;
  last: Point;
  ending: Point | null;
  lag: number | null;
}

export interface TokenGlideDeps {
  /** The ticker the glides step on; without one a token is put in its place at once. */
  getTicker(): Ticker | null;
  getSprite(tokenId: string): Container | null;
  /** Called for every place a token is drawn at, so its UI follows. */
  onMove(tokenId: string, x: number, y: number): void;
  reducedMotion(): boolean;
  /** Where gliding tokens are drawn, for sight and light to follow; unread without one. */
  shown?: ShownPlaces;
  /** Whether a token may be drawn on its way from `from` to `to` (`glideWayIsClear`); every way may be without it. */
  clearWay?(from: Point, to: Point): boolean;
  /** How tokens someone else holds are played out; without one they glide. */
  heldPlayout?(): HeldPlayout | null;
  /** Who holds a token now; nobody without it. */
  heldBy?(tokenId: string): TokenHolder;
  /** The clock the playouts run on, in ms: the cursors' (`performance.now`). */
  now?(): number;
}

/**
 * Moves token sprites to the places they are given without a jump, as the online player client
 * does: every frame a token covers the same share of the way that is left, so a new place given
 * mid-way bends the path instead of restarting it. A token someone else holds is played out instead
 * (`follow`), as far behind as the cursor that holds it, so the two move as one. The ticker is used
 * only while a token moves.
 */
export class TokenGlide {
  private readonly targets = new Map<string, Point>();
  private readonly follows = new Map<string, Follow>();
  private ticker: Ticker | null = null;
  private readonly shown: ShownPlaces;

  constructor(private readonly deps: TokenGlideDeps) {
    this.shown = deps.shown ?? new ShownPlaces();
  }

  /**
   * Glides `tokenId` from where it is drawn to `(x, y)`; where it may not be drawn on that way
   * (`clearWay`), puts it there at once. Sight and light read it where it is drawn from now on.
   */
  to(tokenId: string, x: number, y: number): void {
    const ticker = this.deps.getTicker();
    const sprite = this.deps.getSprite(tokenId);
    const follow = this.follows.get(tokenId);
    const clear = !sprite || (this.deps.clearWay?.(follow?.last ?? sprite.position, { x, y }) ?? true);
    if (!ticker || !clear || this.deps.reducedMotion()) {
      this.jump(tokenId, x, y);
      return;
    }
    // A held token let go of plays out its way to where it was put down, as the cursor that held it does.
    if (follow !== undefined) {
      follow.track.push([{ x, y }], undefined, this.now());
      follow.track.end();
      follow.last = { x, y };
      follow.ending = { x, y };
    } else {
      this.targets.set(tokenId, { x, y });
      if (sprite) this.note(tokenId, sprite.position.x, sprite.position.y);
    }
    this.shown.flush();
    this.start(ticker);
  }

  /**
   * Draws a token someone else holds on its way to `(x, y)`: its places are played out at least as far
   * behind as the cursor of the pointer holding it, so token and cursor move as one. Without a held
   * playout it glides (`to`).
   */
  follow(tokenId: string, x: number, y: number): void {
    const playout = this.deps.heldPlayout?.() ?? null;
    if (playout === null) return this.to(tokenId, x, y);
    const ticker = this.deps.getTicker();
    const sprite = this.deps.getSprite(tokenId);
    const known = this.follows.get(tokenId);
    if (!ticker || !sprite || this.deps.reducedMotion() || !(this.deps.clearWay?.(known?.last ?? sprite.position, { x, y }) ?? true)) {
      this.jump(tokenId, x, y);
      return;
    }
    this.targets.delete(tokenId);
    const now = this.now();
    if (known === undefined || known.ending !== null) {
      const follow: Follow = { track: new PointerTrack({ interval: playout.interval, least: () => this.holderLag(tokenId, follow) }), last: { x, y }, ending: null, lag: null };
      // It leaves from where it is drawn.
      follow.track.push([{ x: sprite.position.x, y: sprite.position.y }, { x, y }], undefined, now);
      this.follows.set(tokenId, follow);
      this.note(tokenId, sprite.position.x, sprite.position.y);
    } else {
      known.track.push([{ x, y }], undefined, now);
      known.last = { x, y };
    }
    this.shown.flush();
    this.start(ticker);
  }

  /** Whether `tokenId` is already on its way to `(x, y)`. */
  headsTo(tokenId: string, x: number, y: number): boolean {
    const target = this.targets.get(tokenId) ?? this.follows.get(tokenId)?.ending;
    return target?.x === x && target.y === y;
  }

  /** Puts `tokenId` at `(x, y)` at once, ending its glide. */
  jump(tokenId: string, x: number, y: number): void {
    this.cancel(tokenId);
    this.place(tokenId, x, y);
  }

  /** Leaves `tokenId` where it is drawn: something else moves it now (a drag, another animation), and sight reads the store again. */
  cancel(tokenId: string): void {
    this.targets.delete(tokenId);
    this.follows.delete(tokenId);
    this.shown.delete(tokenId);
    this.shown.flush();
    if (this.idle()) this.stop();
  }

  destroy(): void {
    this.targets.clear();
    this.follows.clear();
    this.shown.clear();
    this.shown.flush();
    this.stop();
  }

  private readonly step = (ticker: Pick<Ticker, 'deltaMS'>): void => {
    for (const [tokenId, target] of this.targets) {
      const sprite = this.deps.getSprite(tokenId);
      const next = sprite ? glideStep(sprite.position, target, ticker.deltaMS) : target;
      if (next === target) this.targets.delete(tokenId);
      this.place(tokenId, next.x, next.y);
    }
    if (this.follows.size > 0) this.playHeld(this.now());
    this.shown.flush();
    if (this.idle()) this.stop();
  };

  /**
   * Draws each held token where its playout is at `now`. One this view's own pointer took over is left
   * to it; one played out to its end, or to its last place once nobody holds it, is put there.
   */
  private playHeld(now: number): void {
    for (const [tokenId, follow] of this.follows) {
      const holder = this.deps.heldBy?.(tokenId) ?? null;
      if (holder === 'pointer') {
        this.cancel(tokenId);
        continue;
      }
      const at = follow.track.at(now);
      const drawn = this.deps.getSprite(tokenId)?.position;
      if (at !== null && (drawn?.x !== at.x || drawn.y !== at.y)) this.place(tokenId, at.x, at.y);
      if (follow.track.busy(now) || (follow.ending === null && holder === 'elsewhere')) continue;
      this.follows.delete(tokenId);
      this.place(tokenId, follow.last.x, follow.last.y);
    }
  }

  /**
   * How far behind the cursor of a held token's holder is drawn. Once the token is let go of, the holder
   * names it no more: its way to the drop is played out at the lag last read, as the cursor still is.
   */
  private holderLag(tokenId: string, follow: Follow): number {
    const lag = this.deps.heldPlayout?.()?.lag(tokenId) ?? null;
    if (lag !== null || (follow.ending === null && this.deps.heldBy?.(tokenId) === 'elsewhere')) follow.lag = lag;
    return follow.lag ?? 0;
  }

  private start(ticker: Ticker): void {
    if (this.ticker) return;
    this.ticker = ticker;
    ticker.add(this.step, undefined, UPDATE_PRIORITY.HIGH);
  }

  private idle(): boolean {
    return this.targets.size === 0 && this.follows.size === 0;
  }

  private now(): number {
    return this.deps.now?.() ?? performance.now();
  }

  private place(tokenId: string, x: number, y: number): void {
    this.deps.getSprite(tokenId)?.position.set(x, y);
    this.note(tokenId, x, y);
    this.deps.onMove(tokenId, x, y);
  }

  /** Notes where a token is drawn while it glides or plays out; one that has arrived is read where the store has it. */
  private note(tokenId: string, x: number, y: number): void {
    if (this.targets.has(tokenId) || this.follows.has(tokenId)) this.shown.set(tokenId, x, y);
    else this.shown.delete(tokenId);
  }

  private stop(): void {
    this.ticker?.remove(this.step);
    this.ticker = null;
  }
}
