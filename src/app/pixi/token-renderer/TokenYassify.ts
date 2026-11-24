import { Sprite, Texture, type Container } from 'pixi.js';
import yassifyImageUrl from '../../assets/token-yassify.webp';
import { loadAsset } from '../utils/assetLifecycle';
import { destroyTree } from '../utils/destroyTree';
import { getTokenRingOuterDiameter } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';

export const YASSIFY_LABEL = 'tokenYassify';
/**
 * The overlay is one picture of the props around a ring (the bow on top right, the manicured hand raised on the
 * bottom left, the tumbler on the bottom right), drawn for a ring this many times smaller than the picture is wide,
 * since the props reach out past the ring: it spans 1.3 ring radii from the middle each way.
 */
export const OVERLAY_SPAN = 1.3;
/** Above the art, ring and glass, below the downed skull and the hidden-token marker. */
const YASSIFY_Z_INDEX = 4;

// Loaded once per app session and shared by every token, like the ring's texture.
let loadedTexture: Texture | null = null;
let pendingLoad: Promise<Texture | null> | null = null;

function loadOverlayTexture(): Promise<Texture | null> {
  if (loadedTexture) return Promise.resolve(loadedTexture);
  pendingLoad ??= loadAsset<Texture>({ src: yassifyImageUrl, parser: 'texture', data: { autoGenerateMipmaps: true, scaleMode: 'linear' } })
    .then((texture) => (texture instanceof Texture && texture !== Texture.EMPTY ? (loadedTexture = texture) : null))
    .catch((error: unknown) => {
      console.error('[TokenYassify] Failed to load the overlay texture:', error);
      return null;
    })
    .finally(() => { pendingLoad = null; });
  return pendingLoad;
}

/**
 * Yassify (Appearance settings): every token wears a bow, raises a hand to show off its nails and holds a tumbler.
 * One sprite per token over its ring, sized by the ring and turned with the art as the ring is
 * (`SpriteFactory.updateTokenRotation`); a child of the token's group, so it moves, hides and goes with its token,
 * in the player window too. Every token shares the one texture.
 */
export class TokenYassify {
  private readonly waiting = new Set<TokenGroupContainer>();

  /** `requestRender` must draw a frame: a texture arriving after its tokens is invisible to the render scheduler. */
  constructor(private readonly requestRender: () => void) {}

  /** Dresses `tokenGroup` while `on`, takes the overlay off otherwise. */
  public update(tokenGroup: TokenGroupContainer, on: boolean): void {
    const existing = tokenGroup.getChildByLabel(YASSIFY_LABEL);
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
    tokenGroup.addChild(new Sprite({ texture: loadedTexture, anchor: 0.5, label: YASSIFY_LABEL, zIndex: YASSIFY_Z_INDEX, eventMode: 'none' }));
    tokenGroup.sortChildren();
    this.refresh(tokenGroup);
  }

  /** Sizes and turns the overlay again with the ring, after the ring was rebuilt. */
  public refresh(tokenGroup: TokenGroupContainer): void {
    const overlay = tokenGroup.getChildByLabel(YASSIFY_LABEL) as Sprite | null;
    if (!overlay) return;
    overlay.scale.set((ringDiameter(tokenGroup) * OVERLAY_SPAN) / overlay.texture.width);
    overlay.rotation = tokenGroup.getChildByLabel('tokenSprite')?.rotation ?? 0;
  }

  /** Forgets a token group that is going away. */
  public release(tokenGroup: TokenGroupContainer): void {
    this.waiting.delete(tokenGroup);
  }

  private waitForTexture(tokenGroup: TokenGroupContainer): void {
    const first = this.waiting.size === 0;
    this.waiting.add(tokenGroup);
    if (!first) return;
    void loadOverlayTexture().then((texture) => {
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
