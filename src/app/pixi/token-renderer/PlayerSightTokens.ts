import type { FogCoverage } from '../../fog/fogCoverage';
import { FogMembership, frameHides, framePerception, type FrameFacts } from '../../perception/framePerception';
import type { TokenEntity } from '../../types';
import type { TokenPerception } from '../../vision/tokenPerception';
import { PLAYER_SIGHT_POLICY } from '../../vision/tokenSightPolicy';
import { hiddenTokenLayers, type HideableLayer, type LayerVisibility } from '../playerSafeFrame';
import { SensedOutlines, type SensedToken } from './SensedOutlines';
import type { TokenGroupContainer } from './types';

/** What the sight of the players' tokens needs to know of the token renderer. */
export interface PlayerSightHost {
  tokens: () => Record<string, TokenEntity>;
  sprites: () => Record<string, TokenGroupContainer | null>;
  /** The tokens the pointer holds or drags. */
  held: () => ReadonlySet<string>;
  /** Whether the canvas shows the players' picture now (`CanvasAudience.showsPlayers`). */
  showsPlayers: () => boolean;
}

/**
 * The tokens as the players' sight shows them: which the canvas leaves out while it shows the
 * players' picture (`CanvasAudience`), which a players' frame leaves out,
 * and the outlines of those the players only sense (`SensedOutlines`).
 */
export class PlayerSightTokens {
  private readonly outlines = new SensedOutlines();
  private provider?: () => TokenPerception | undefined;
  private current?: (() => boolean) | undefined;
  private fog?: () => FogCoverage | null;
  /** Whether the roof of the level shown covers a point in the players' picture. */
  private roof?: (point: { x: number; y: number }) => boolean;
  private readonly membership = new FogMembership();
  /** What the players' frame hides tokens by besides the lighting, read live from the host and the providers. */
  private readonly facts: FrameFacts;

  constructor(private readonly host: PlayerSightHost) {
    const fog = (): FogCoverage | null | undefined => this.fog?.();
    const roof = (): FrameFacts['roof'] => this.roof ?? null;
    this.facts = {
      get tokens() { return host.tokens(); },
      place: (tokenId) => host.sprites()[tokenId],
      get fog() { return fog(); },
      get roof() { return roof(); },
      policy: PLAYER_SIGHT_POLICY,
    };
  }

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
  setProvider(provider: () => TokenPerception | undefined, current?: () => boolean): void {
    this.provider = provider;
    this.current = current;
  }

  /** A lighting controller is attached, so on a lit scene the players see a token only where their sight finds it. */
  hasLighting(): boolean {
    return this.provider !== undefined;
  }

  /** Committed fog remains available when the optional lighting controller is removed. */
  setFogProvider(provider: () => FogCoverage | null): void {
    this.fog = provider;
  }

  /**
   * The roof drawn over the players' picture (`ViewRoofs.covers`): a token whose centre it covers is
   * not seen, as under committed fog, lit scene or not.
   */
  setRoofProvider(covers: (point: { x: number; y: number }) => boolean): void {
    this.roof = covers;
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

  private fogActive(perception?: TokenPerception): boolean {
    return !!perception || this.host.showsPlayers();
  }

  /** A frame always applies fog and the roof (`framePerception`), including on an unlit scene and during a held gesture. */
  framePerception(perception?: TokenPerception): TokenPerception | undefined {
    return framePerception(perception, this.facts, this.membership);
  }

  /** How the players perceive each token, while the canvas shows their view. */
  perception(): TokenPerception | undefined {
    const perception = this.provider?.();
    return this.fogActive(perception) ? this.framePerception(perception) : perception;
  }

  /** Fog and the roof exclude held tokens too; the held exception applies only to lighting. */
  hides(tokenId: string, perception = this.perception()): boolean {
    if (this.fogActive(perception) && frameHides(tokenId, this.facts, this.membership)) return true;
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
