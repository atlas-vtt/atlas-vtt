import type { FogCoverage } from '../../fog/fogCoverage';
import type { TokenEntity } from '../../types';
import type { TokenPerception } from '../lighting/playerLightingLayers';
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
   * as in the player frame; those they only sense show as outlines.
   */
  setProvider(provider: () => TokenPerception | undefined, active?: () => boolean): void {
    this.provider = provider;
    this.active = active;
  }

  /** Committed fog remains available when the optional lighting controller is removed. */
  setFogProvider(provider: () => FogCoverage | null, playerView: () => boolean): void {
    this.fog = provider;
    this.playerView = playerView;
  }

  private fogActive(perception?: TokenPerception): boolean {
    return !!perception || !!this.active?.() || !!this.playerView?.();
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
    this.outlines.destroy();
  }
}

/** Whether the players see the token itself, for what shows only with it (nameplate, bars, drag ruler). */
export function seenTokens(perception: TokenPerception | undefined): ((tokenId: string) => boolean) | undefined {
  return perception && ((tokenId) => perception(tokenId) === 'seen');
}
