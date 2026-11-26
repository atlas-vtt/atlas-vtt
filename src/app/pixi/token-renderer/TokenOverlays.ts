import { Container, Sprite, Texture } from 'pixi.js';
import type { TokenOverlay } from '../../api/apiTypes';
import { tokenOverlays } from '../../api/extensionPoints';
import { loadAsset } from '../utils/assetLifecycle';
import { destroyTree } from '../utils/destroyTree';
import { getTokenRingOuterDiameter } from './tokenRingMetrics';
import type { TokenGroupContainer } from './types';

export const OVERLAYS_LABEL = 'tokenOverlays';
/** Above the art, ring and glass, below the downed skull and the hidden-token marker. */
const OVERLAYS_Z_INDEX = 4;

// Loaded once per picture and shared by every token, like the ring's texture. A picture that failed stays out.
const textures = new Map<string, Texture | 'failed'>();
const loading = new Map<string, Promise<void>>();

function loadTexture(image: string): Promise<void> {
  let load = loading.get(image);
  if (load) return load;
  load = loadAsset<Texture>({ src: image, parser: 'texture', data: { autoGenerateMipmaps: true, scaleMode: 'linear' } })
    .then((texture) => { textures.set(image, texture instanceof Texture && texture !== Texture.EMPTY ? texture : 'failed'); })
    .catch((error: unknown) => {
      console.error('[TokenOverlays] Failed to load an overlay picture:', error);
      textures.set(image, 'failed');
    })
    .finally(() => loading.delete(image));
  loading.set(image, load);
  return load;
}

/**
 * The pictures other plugins draw over every token (`AtlasApi.tokens.addOverlay`). One layer per token over its ring,
 * scaled by the ring and turned with the art as the ring is (`SpriteFactory.updateTokenRotation`); a child of the
 * token's group, so it moves, hides and goes with its token, in the player window too.
 */
export class TokenOverlays {
  /** The overlays each layer was built from, once every picture of them had loaded. */
  private readonly built = new WeakMap<Container, readonly TokenOverlay[]>();
  /** Pictures this renderer waits for, so it redraws once per picture, not once per token. */
  private readonly awaiting = new Set<string>();

  /** `redrawAll` must update every token and draw a frame: a picture arriving after its tokens is invisible to the render scheduler. */
  constructor(private readonly redrawAll: () => void) {}

  /** Gives `tokenGroup` a layer of the overlays added now, or takes its layer off when there are none. */
  public update(tokenGroup: TokenGroupContainer): void {
    const overlays = tokenOverlays.list();
    const existing = tokenGroup.getChildByLabel(OVERLAYS_LABEL);
    if (existing && this.built.get(existing) === overlays) return;
    if (existing) destroyTree(existing);
    if (overlays.length === 0) return;
    const layer = new Container({ label: OVERLAYS_LABEL, zIndex: OVERLAYS_Z_INDEX, eventMode: 'none' });
    let complete = true;
    for (const overlay of overlays) {
      const texture = textures.get(overlay.image);
      if (texture === 'failed') continue;
      if (!texture) {
        complete = false;
        this.await(overlay.image);
        continue;
      }
      // Sized for a ring one unit across; the layer scales it to the ring.
      layer.addChild(new Sprite({ texture, anchor: 0.5, scale: overlay.span / texture.width }));
    }
    if (complete) this.built.set(layer, overlays);
    tokenGroup.addChild(layer);
    tokenGroup.sortChildren();
    this.refresh(tokenGroup);
  }

  private await(image: string): void {
    if (this.awaiting.has(image)) return;
    this.awaiting.add(image);
    void loadTexture(image).then(() => {
      this.awaiting.delete(image);
      this.redrawAll();
    });
  }

  /** Sizes and turns the layer again with the ring, after the ring was rebuilt. */
  public refresh(tokenGroup: TokenGroupContainer): void {
    const layer = tokenGroup.getChildByLabel(OVERLAYS_LABEL);
    if (!layer) return;
    layer.scale.set(ringDiameter(tokenGroup));
    layer.rotation = tokenGroup.getChildByLabel('tokenSprite')?.rotation ?? 0;
  }
}

/** The ring's outer diameter, or where it would be on a token without one. */
function ringDiameter(tokenGroup: TokenGroupContainer): number {
  const ring: Container | null = tokenGroup.getChildByLabel('tokenRing');
  return ring && ring.width > 0 ? ring.width : getTokenRingOuterDiameter(tokenGroup.tokenSize, tokenGroup.strokeWidth);
}
