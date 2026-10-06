import type { DiceRollOrigin } from '../types/diceRollOrigin';
import type { PlayerRollSources, RollSceneLookup, ShownRollToken } from './playerRollSource';

/** A held picture: the tokens it showed, as plain data. */
interface HeldScene {
  readonly viewId: string;
  readonly mapPath: string;
  readonly tokens: ReadonlyMap<string, ShownRollToken>;
}

/**
 * The scene the player window shows, as rolls ask which of its tokens it shows. Live, it
 * asks the presented view's renderer at each roll. While the GM browses other scene tabs
 * the window holds its last picture, and rolls are answered from what that picture showed,
 * taken once at the first hold: later holds while browsing keep it, and nothing of the
 * view is kept with it. Presenting a scene, or the presented one rendered again, goes
 * live once more.
 */
export class PlayerRollScene implements RollSceneLookup {
  private live: PlayerRollSources | null = null;
  private held: HeldScene | null = null;

  /** A scene was presented, or rendered again; without answers, rolls name nobody. */
  present(sources: PlayerRollSources | undefined): void {
    this.live = sources ?? null;
    this.held = null;
  }

  /** Keeps what the presented scene shows now, at the first hold only. */
  hold(): void {
    if (this.held || !this.live) return;
    const { viewId, mapPath } = this.live;
    this.held = { viewId, mapPath, tokens: new Map(this.live.shownTokens()) };
    this.live = null;
  }

  /** The presented view closed: nothing is answered until a scene is presented again. */
  release(): void {
    this.live = null;
    this.held = null;
  }

  shownToken(origin: DiceRollOrigin): ShownRollToken | null {
    const scene = this.held ?? this.live;
    if (!scene || origin.viewId !== scene.viewId || origin.mapPath !== scene.mapPath) return null;
    const tokens = this.held ? this.held.tokens : this.live?.shownTokens([origin.tokenId]);
    return tokens?.get(origin.tokenId) ?? null;
  }
}
