import type { Container, Ticker } from 'pixi.js';

/** How far a bump leans towards the wall, as a share of a grid cell. */
const LEAN_CELLS = 0.11;
/** The lean's length; then a damped spring takes the token back, with one small overshoot. */
const LEAN_MS = 80;
const BUMP_MS = 340;
/** The spring back: its angular speed (first through rest after about 70 ms) and its damping (an overshoot of about 15 %). */
const SPRING_OMEGA = Math.PI / 0.14;
const SPRING_DAMPING = 13.5;
/** How much the token flattens against the wall at the lean's peak, and widens across it. */
const SQUASH = 0.05;
const STRETCH = 0.03;
/** A bump in its first half is not begun again: a held key presses five times a second, which would only jitter. */
const RESTART_AFTER_MS = 160;

const easeOutCubic = (share: number): number => 1 - (1 - share) ** 3;

/**
 * How far into its lean a bump is `ms` after it began: up to 1 as the token meets the wall, then back
 * through 0 with a small overshoot, settling at exactly 0 by `BUMP_MS`.
 */
export function bumpShare(ms: number): number {
  if (ms <= 0 || ms >= BUMP_MS) return 0;
  if (ms < LEAN_MS) return easeOutCubic(ms / LEAN_MS);
  const seconds = (ms - LEAN_MS) / 1000;
  const spring = Math.exp(-SPRING_DAMPING * seconds) * Math.cos(SPRING_OMEGA * seconds);
  // The last fifth fades whatever is left, so the token lands on its place without a step.
  const tail = Math.min(1, (BUMP_MS - ms) / (BUMP_MS * 0.2));
  return spring * tail;
}

/** The scale a bump gives a token leaning `share` towards the unit direction `(ux, uy)`: flatter along it, wider across, only while pressed against the wall. */
export function bumpScale(share: number, ux: number, uy: number): { readonly x: number; readonly y: number } {
  const pressed = Math.max(0, share) ** 2;
  const along = 1 - SQUASH * pressed;
  const across = 1 + STRETCH * pressed;
  return { x: along * ux * ux + across * uy * uy, y: along * uy * uy + across * ux * ux };
}

interface Bump {
  readonly group: Container;
  readonly ux: number;
  readonly uy: number;
  elapsed: number;
}

export interface TokenBumpDeps {
  getTicker(): Ticker | null;
  getSprite(tokenId: string): Container | null;
  /** The grid's cell size in world pixels. */
  cell(): number;
  reducedMotion(): boolean;
}

/**
 * A token that walks into a wall bumps against it, as in a game: its drawing leans a little towards the
 * wall and springs back, flattening as it meets it. Only the drawing moves (its pivot and scale), never
 * the token's place, so its UI, sight and light stay where they are. Nothing moves under reduced motion.
 */
export class TokenBump {
  private readonly deps: TokenBumpDeps;
  private readonly bumps = new Map<string, Bump>();
  private ticker: Ticker | null = null;

  constructor(deps: TokenBumpDeps) {
    this.deps = deps;
  }

  /** Bumps the token towards `(dx, dy)`. */
  bump(tokenId: string, dx: number, dy: number): void {
    const length = Math.hypot(dx, dy);
    const group = this.deps.getSprite(tokenId);
    if (group === null || !(length > 0) || this.deps.reducedMotion()) return;
    const running = this.bumps.get(tokenId);
    if (running !== undefined && running.elapsed < RESTART_AFTER_MS) return;
    this.bumps.set(tokenId, { group, ux: dx / length, uy: dy / length, elapsed: 0 });
    this.listen();
  }

  /** Ends a token's bump, its drawing back in place. */
  cancel(tokenId: string): void {
    const bump = this.bumps.get(tokenId);
    if (bump === undefined) return;
    this.rest(bump);
    this.bumps.delete(tokenId);
  }

  destroy(): void {
    for (const id of [...this.bumps.keys()]) this.cancel(id);
    this.ticker?.remove(this.step);
    this.ticker = null;
  }

  private listen(): void {
    if (this.ticker !== null) return;
    this.ticker = this.deps.getTicker();
    this.ticker?.add(this.step);
  }

  private readonly step = (ticker: Ticker): void => {
    const lean = LEAN_CELLS * this.deps.cell();
    for (const [id, bump] of this.bumps) {
      bump.elapsed += ticker.deltaMS;
      if (bump.group.destroyed || bump.elapsed >= BUMP_MS) {
        this.rest(bump);
        this.bumps.delete(id);
        continue;
      }
      const share = bumpShare(bump.elapsed);
      const scale = bumpScale(share, bump.ux, bump.uy);
      bump.group.scale.set(scale.x, scale.y);
      // The pivot is in the group's own units: the drawing moves `lean * share` world pixels towards the wall.
      bump.group.pivot.set((-bump.ux * lean * share) / scale.x, (-bump.uy * lean * share) / scale.y);
    }
    if (this.bumps.size === 0) {
      this.ticker?.remove(this.step);
      this.ticker = null;
    }
  };

  private rest(bump: Bump): void {
    if (bump.group.destroyed) return;
    bump.group.pivot.set(0, 0);
    bump.group.scale.set(1, 1);
  }
}
