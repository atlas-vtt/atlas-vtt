import { Assets, Sprite, Texture, type Container } from 'pixi.js';
import tokenBowImageUrl from '../../assets/token-bow.webp';
import { destroyTree } from '../utils/destroyTree';
import { getTokenRingOuterDiameter } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';

const BOW_LABEL = 'tokenBow';
/** Above the art, ring and glass, below the downed skull and the hidden-token marker. */
const BOW_Z_INDEX = 4;
/** The bow's width as a share of the ring's outer diameter. */
const BOW_WIDTH = 0.55;
/** Where its knot sits: on the ring's top right, this share of the ring's radius out from the middle. */
const BOW_REACH = 0.86;
/** Tilted a little, as a bow pinned on in passing. */
const BOW_TILT = 0.3;

// Loaded once per app session and shared by every bow, like the ring's texture.
let loadedTexture: Texture | null = null;
let pendingLoad: Promise<Texture | null> | null = null;

function loadBowTexture(): Promise<Texture | null> {
  if (loadedTexture) return Promise.resolve(loadedTexture);
  pendingLoad ??= Assets.load<Texture>({ src: tokenBowImageUrl, parser: 'texture', data: { autoGenerateMipmaps: true, scaleMode: 'linear' } })
    .then((texture) => (texture instanceof Texture && texture !== Texture.EMPTY ? (loadedTexture = texture) : null))
    .catch((error: unknown) => {
      console.error('[TokenBows] Failed to load the bow texture:', error);
      return null;
    })
    .finally(() => { pendingLoad = null; });
  return pendingLoad;
}

/**
 * Yassify (Appearance settings): a hand-painted bow on every token's top right, upright whichever way the token
 * turns, sized by its ring. A child of the token's group, so it moves, hides and goes with its token, in the player
 * window too. Every bow shares one texture.
 */
export class TokenBows {
  private readonly waiting = new Set<TokenGroupContainer>();

  /** `requestRender` must draw a frame: a texture arriving after its sprite is invisible to the render scheduler. */
  constructor(private readonly requestRender: () => void) {}

  /** Gives `tokenGroup` its bow while `on`, takes it away otherwise. */
  public update(tokenGroup: TokenGroupContainer, on: boolean): void {
    const existing = tokenGroup.getChildByLabel(BOW_LABEL);
    if (!on) {
      this.waiting.delete(tokenGroup);
      if (existing) destroyTree(existing);
      return;
    }
    if (existing) return;
    if (!loadedTexture) {
      this.waitForTexture(tokenGroup);
      return;
    }
    const bow = new Sprite({ texture: loadedTexture, anchor: { x: 0.5, y: 0.45 }, label: BOW_LABEL, zIndex: BOW_Z_INDEX, eventMode: 'none' });
    tokenGroup.addChild(bow);
    tokenGroup.sortChildren();
    this.refresh(tokenGroup);
  }

  /** Places the bow again for the ring's size, after the ring was rebuilt. */
  public refresh(tokenGroup: TokenGroupContainer): void {
    const bow = tokenGroup.getChildByLabel(BOW_LABEL) as Sprite | null;
    if (!bow) return;
    const outer = ringDiameter(tokenGroup);
    const reach = (outer / 2) * BOW_REACH * Math.SQRT1_2;
    bow.position.set(reach, -reach);
    bow.rotation = BOW_TILT;
    bow.scale.set((outer * BOW_WIDTH) / bow.texture.width);
  }

  /** Forgets a token group that is going away. */
  public release(tokenGroup: TokenGroupContainer): void {
    this.waiting.delete(tokenGroup);
  }

  private waitForTexture(tokenGroup: TokenGroupContainer): void {
    const first = this.waiting.size === 0;
    this.waiting.add(tokenGroup);
    if (!first) return;
    void loadBowTexture().then((texture) => {
      const groups = Array.from(this.waiting);
      this.waiting.clear();
      if (!texture) return;
      for (const group of groups) if (!group.destroyed) this.update(group, true);
      this.requestRender();
    });
  }
}

/** The ring's outer diameter, or where it would be on a token without one. */
function ringDiameter(tokenGroup: TokenGroupContainer): number {
  const ring: Container | null = tokenGroup.getChildByLabel('tokenRing');
  return ring && ring.width > 0 ? ring.width : getTokenRingOuterDiameter(tokenGroup.tokenSize, tokenGroup.strokeWidth);
}
