import type { FogCoverage } from '../../fog/fogCoverage';
import type { TokenEntity } from '../../types';
import type { TokenSeen } from '../../vision/measureOrigin';
import type { TokenPerception } from '../../vision/tokenPerception';
import { hiddenTokenLayers, type HideableLayer, type LayerVisibility } from '../playerSafeFrame';
import { SensedOutlines, type SensedToken } from './SensedOutlines';
import type { TokenGroupContainer } from './types';

/** What the sight of the players' tokens needs to know of the token renderer. */
export interface PlayerSightHost {
  tokens: () => Record<string, TokenEntity>;
  sprites: () => Record<string, TokenGroupContainer | null>;
  /** The tokens the pointer holds or drags. */
  held: () => ReadonlySet<string>;
}

/**
 * The tokens as the players' sight shows them: which the canvas leaves out while it shows the
 * players' view of a lit scene (session view, the peek key), which a players' frame leaves out,
 * and the outlines of those the players only sense (`SensedOutlines`).
 */
export class PlayerSightTokens {
  private readonly outlines = new SensedOutlines();
  private provider?: () => TokenPerception | undefined;
  private active?: (() => boolean) | undefined;
  private current?: (() => boolean) | undefined;
  /** The work `whenSettled` holds until the store's write has reached every listener. */
  private settling: (() => void) | null = null;
  private destroyed = false;
  private fog?: () => FogCoverage | null;
  private playerView?: () => boolean;
  /** The immutable shape and displayed centre fully determine fog membership. */
  private readonly membership = new WeakMap<object, { coverage: FogCoverage; x: number; y: number; covered: boolean }>();

  constructor(private readonly host: PlayerSightHost) {}

  /** The layer of the outlines, for the token renderer's viewport and the list of what the players' view shows. */
  get outlineLayer(): SensedOutlines['view'] {
    return this.outlines.view;
  }

  /**
   * `provider` answers how the players perceive each token while the canvas shows their view,
   * and nothing otherwise. Tokens they do not see are left out with their nameplates and bars,
   * as in the player frame; those they only sense show as outlines. A provider that keeps sight
   * of its own, worked out by its own store listener (the lighting), says through `current`
   * whether that sight is of the scene the store holds.
   */
  setProvider(provider: () => TokenPerception | undefined, active?: () => boolean, current?: () => boolean): void {
    this.provider = provider;
    this.active = active;
    this.current = current;
  }

  /** Committed fog remains available when the optional lighting controller is removed. */
  setFogProvider(provider: () => FogCoverage | null, playerView: () => boolean): void {
    this.fog = provider;
    this.playerView = playerView;
  }

  /** Whether the canvas shows the players' view: session view, or the peek of a lit scene. */
  showsPlayers(): boolean {
    return !!this.active?.() || !!this.playerView?.();
  }

  /**
   * Whether the canvas, while it shows the players' view, sees the tokens as a players' frame does:
   * the lighting shows their view on it (session view, the peek), or no lighting is wired. The command
   * palette's player mode leaves the lighting out on the canvas, which a frame applies.
   */
  sharesFrameSight(): boolean {
    return this.active?.() ?? true;
  }

  /**
   * Whether the provider's sight is that of the scene the store holds. The lighting keeps the sight
   * of the scene before from a scene switch until it has built the one that arrives, and the sight
   * from before a lost graphics context until it has built on the restored one; sight read from the
   * store when asked always is.
   */
  sightIsCurrent(): boolean {
    return this.current?.() ?? true;
  }

  /**
   * Runs `work` once the provider's sight has taken in the store's latest write: at once where sight
   * is read from the store when asked, and once the write has reached every listener where the
   * provider keeps sight of its own, since its listener may come after the token renderer's. Calls
   * made meanwhile run the last `work` once.
   */
  whenSettled(work: () => void): void {
    if (!this.current) {
      work();
      return;
    }
    const scheduled = this.settling !== null;
    this.settling = work;
    if (scheduled) return;
    queueMicrotask(() => {
      const pending = this.settling;
      this.settling = null;
      if (!this.destroyed) pending?.();
    });
  }

  private fogActive(perception?: TokenPerception): boolean {
    return !!perception || this.showsPlayers();
  }

  private covered(tokenId: string, coverage: FogCoverage | null): boolean {
    const point = this.host.sprites()[tokenId] ?? this.host.tokens()[tokenId];
    if (!coverage || !point) return true;
    const known = this.membership.get(point);
    if (known?.coverage === coverage && known.x === point.x && known.y === point.y) return known.covered;
    const covered = coverage.covers(point);
    this.membership.set(point, { coverage, x: point.x, y: point.y, covered });
    return covered;
  }

  /** A frame always applies fog, including on an unlit scene and during a held gesture. */
  framePerception(perception?: TokenPerception): TokenPerception | undefined {
    if (!this.fog) return perception;
    const coverage = this.fog();
    if (coverage?.shape.length === 0) return perception;
    return (id) => this.covered(id, coverage) ? 'unseen' : (perception?.(id) ?? 'seen');
  }

  /** How the players perceive each token, while the canvas shows their view. */
  perception(): TokenPerception | undefined {
    const perception = this.provider?.();
    return this.fogActive(perception) ? this.framePerception(perception) : perception;
  }

  /** Fog excludes held tokens too; the held exception applies only to lighting. */
  hides(tokenId: string, perception = this.perception()): boolean {
    if (this.fog && this.fogActive(perception) && this.covered(tokenId, this.fog())) return true;
    return !!perception && perception(tokenId) !== 'seen' && !this.host.held().has(tokenId);
  }

  /**
   * Outlines exactly the tokens the players sense without seeing them, never a hidden one. A
   * token the pointer holds keeps its outline for the players' frame only: on the canvas the
   * token itself stays under the pointer.
   */
  syncOutlines(perception = this.perception()): void {
    const sensed = Object.keys(perception ? this.host.sprites() : {}).flatMap((id) => {
      const token = this.sensedToken(id, perception);
      return token ? [token] : [];
    });
    this.outlines.sync(sensed);
  }

  /** Position updates affect only the moved outline, not every token in the scene. */
  syncOutline(id: string, perception = this.perception()): void {
    this.outlines.syncOne(id, this.sensedToken(id, perception));
  }

  private sensedToken(id: string, perception: TokenPerception | undefined): SensedToken | null {
    const token = this.host.tokens()[id];
    const sprite = this.host.sprites()[id];
    if (!token || !sprite || token.isHidden || perception?.(id) !== 'sensed') return null;
    return { id, x: sprite.x, y: sprite.y, size: sprite.tokenSize || 70, held: this.host.held().has(id) };
  }

  /** What a players' frame changes about the tokens: those they do not see are left out, and the outlines of held ones show. */
  frameLayers(perception: TokenPerception | undefined): LayerVisibility[] {
    this.syncOutlines(perception);
    return [...hiddenTokenLayers(this.host.tokens(), this.host.sprites(), perception), { layer: this.outlines.heldView, visible: true }];
  }

  /** A picture of the scene is the GM's: no outlines. */
  gmLayers(): LayerVisibility[] {
    return [{ layer: this.outlines.view satisfies HideableLayer, visible: false }];
  }

  destroy(): void {
    this.destroyed = true;
    this.outlines.destroy();
  }
}

/** Whether the players see the token itself, for what shows only with it (nameplate, bars, drag ruler). */
export function seenTokens(perception: TokenPerception | undefined): ((tokenId: string) => boolean) | undefined {
  return perception && ((tokenId) => perception(tokenId) === 'seen');
}

/**
 * Whether the players see a token, for what shows only with it: it exists, is not hidden, and
 * `perception` (their sight with committed fog) sees it, or answers nothing (an unlit scene without
 * fog). A token they only sense, do not see or that fog covers is not seen.
 */
export function seenByPlayers(tokens: Readonly<Record<string, { isHidden?: boolean }>>, perception: TokenPerception | undefined): TokenSeen {
  return (tokenId) => {
    const token = tokens[tokenId];
    return !!token && !token.isHidden && (perception?.(tokenId) ?? 'seen') === 'seen';
  };
}

/** Sees no token: what a players' frame answers while it cannot tell. */
export const NOTHING_SEEN: TokenSeen = () => false;
