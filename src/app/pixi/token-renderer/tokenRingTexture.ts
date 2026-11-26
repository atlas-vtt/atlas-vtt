import { Texture } from 'pixi.js';
import tokenRingImageUrl from '../../assets/token-ring.webp';
import { loadAsset } from '../utils/assetLifecycle';

// Loaded once per app session and shared by every token and preview that draws a ring.
let loadedTexture: Texture | null = null;
let pendingLoad: Promise<Texture | null> | null = null;

/** The token ring texture, or null until it has loaded. */
export function loadedTokenRingTexture(): Texture | null {
  return loadedTexture;
}

/** Loads the token ring texture once; resolves to null when it cannot be loaded. */
export function loadTokenRingTexture(): Promise<Texture | null> {
  if (loadedTexture) return Promise.resolve(loadedTexture);

  pendingLoad ??= (async (): Promise<Texture | null> => {
    try {
      const texture = await loadAsset<Texture>({
        src: tokenRingImageUrl,
        parser: 'texture',
        data: {
          autoGenerateMipmaps: true,
          scaleMode: 'linear',
        },
      });
      if (texture instanceof Texture && texture !== Texture.EMPTY) {
        loadedTexture = texture;
        return texture;
      }
      return null;
    } catch (error) {
      console.error('[TokenRing] Failed to load the token ring texture:', error);
      return null;
    } finally {
      pendingLoad = null;
    }
  })();
  return pendingLoad;
}
