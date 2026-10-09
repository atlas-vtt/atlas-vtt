import { UPDATE_PRIORITY, type Container, type Ticker } from 'pixi.js';

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

export interface TokenGlideDeps {
  /** The ticker the glides step on; without one a token is put in its place at once. */
  getTicker(): Ticker | null;
  getSprite(tokenId: string): Container | null;
  /** Called for every place a token is drawn at, so its UI follows. */
  onMove(tokenId: string, x: number, y: number): void;
  reducedMotion(): boolean;
}

/**
 * Moves token sprites to the places they are given without a jump, as the online player client
 * does: every frame a token covers the same share of the way that is left, so a new place given
 * mid-way bends the path instead of restarting it. The ticker is used only while a token moves.
 */
export class TokenGlide {
  private readonly targets = new Map<string, Point>();
  private ticker: Ticker | null = null;

  constructor(private readonly deps: TokenGlideDeps) {}

  /** Glides `tokenId` from where it is drawn to `(x, y)`. */
  to(tokenId: string, x: number, y: number): void {
    const ticker = this.deps.getTicker();
    if (!ticker || this.deps.reducedMotion()) {
      this.jump(tokenId, x, y);
      return;
    }
    this.targets.set(tokenId, { x, y });
    if (this.ticker) return;
    this.ticker = ticker;
    ticker.add(this.step, undefined, UPDATE_PRIORITY.HIGH);
  }

  /** Whether `tokenId` is already on its way to `(x, y)`. */
  headsTo(tokenId: string, x: number, y: number): boolean {
    const target = this.targets.get(tokenId);
    return target?.x === x && target.y === y;
  }

  /** Puts `tokenId` at `(x, y)` at once, ending its glide. */
  jump(tokenId: string, x: number, y: number): void {
    this.cancel(tokenId);
    this.place(tokenId, x, y);
  }

  /** Leaves `tokenId` where it is drawn: something else moves it now (a drag, another animation). */
  cancel(tokenId: string): void {
    this.targets.delete(tokenId);
    if (this.targets.size === 0) this.stop();
  }

  destroy(): void {
    this.targets.clear();
    this.stop();
  }

  private readonly step = (ticker: Pick<Ticker, 'deltaMS'>): void => {
    for (const [tokenId, target] of this.targets) {
      const sprite = this.deps.getSprite(tokenId);
      const next = sprite ? glideStep(sprite.position, target, ticker.deltaMS) : target;
      if (next === target) this.targets.delete(tokenId);
      this.place(tokenId, next.x, next.y);
    }
    if (this.targets.size === 0) this.stop();
  };

  private place(tokenId: string, x: number, y: number): void {
    this.deps.getSprite(tokenId)?.position.set(x, y);
    this.deps.onMove(tokenId, x, y);
  }

  private stop(): void {
    this.ticker?.remove(this.step);
    this.ticker = null;
  }
}
