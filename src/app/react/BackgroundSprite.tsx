import React, { useEffect, useState } from 'react';
import { TFile } from 'obsidian';
import { Texture, Sprite } from 'pixi.js';
import { useAtlasUI } from './root/AtlasUIContext';
import { useViewStoreHook } from './ViewStoreContext';
import type { GridOptions } from '../grid/GridSystem';
import { toGridOptions } from '../grid/gridStateOptions';
import { backgroundTextureCache } from '../pixi/backgroundTextureCache';
import { loadVaultTexture } from '../pixi/vaultImageTexture';

const FALLBACK_GRID_OPTIONS: GridOptions = {
  type: 'square',
  size: 70,
  offsetX: 0,
  offsetY: 0,
  color: 0xFFFFFF,
  alpha: 0.3,
  lineType: 'dotted',
  lineWidth: 1,
  enabled: true,
};

interface LoadedBackground {
  texture: Texture;
  /** The cache URL to release once the texture is no longer shown. */
  url: string;
  size: { width: number; height: number };
}

interface BackgroundSpriteProps {
  imagePath: string;
}

export const BackgroundSprite: React.FC<BackgroundSpriteProps> = ({ imagePath }) => {
  const { app, renderer } = useAtlasUI();
  const store = useViewStoreHook();
  // The texture and the cache URL it holds travel together: the URL is released only once the
  // sprite showing the texture is out of the viewport (an object URL's texture is destroyed on release).
  const [loaded, setLoaded] = useState<LoadedBackground | null>(null);

  useEffect(() => {
    if (!imagePath) return;
    let isCancelled = false;

    const loadTexture = async (): Promise<void> => {
      try {
        // A remote view's maps arrive by URL (object URLs); vault images load by their resource URL.
        let url = imagePath;
        if (!imagePath.startsWith('blob:') && !store.getState().remoteView) {
          const imgFile = app.vault.getAbstractFileByPath(imagePath);
          if (!(imgFile instanceof TFile)) {
            console.error(`[BackgroundSprite] Image file not found: ${imagePath}`);
            return;
          }
          url = app.vault.adapter.getResourcePath(imgFile.path);
        }
        const texture = await backgroundTextureCache.acquire(url, async () => {
          if (url.startsWith('blob:')) {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error('Failed to load blob image'));
              img.src = url;
            });
            return Texture.from(img);
          } else {
            const file = app.vault.getAbstractFileByPath(imagePath);
            if (!(file instanceof TFile)) throw new Error('Not a file');
            return loadVaultTexture(app.vault, file);
          }
        });
        if (isCancelled) {
          backgroundTextureCache.release(url);
          return;
        }
        setLoaded({ texture, url, size: { width: texture.width, height: texture.height } });
      } catch (error) {
        console.error(`[BackgroundSprite] Failed to load texture: ${imagePath}`, error);
      }
    };

    void loadTexture();

    return () => {
      isCancelled = true;
    };
  }, [imagePath, app.vault, store]);

  // Add/update the sprite in the viewport when texture is loaded
  useEffect(() => {
    if (!loaded || !renderer) return;
    const { texture, size } = loaded;
    
    const viewport = renderer.getViewportInstance();
    if (!viewport) {
      console.error('[BackgroundSprite] No viewport available');
      return;
    }
    
    // Create sprite using native PixiJS
    const sprite = new Sprite(texture);
    sprite.width = size.width;
    sprite.height = size.height;
    sprite.x = 0;
    sprite.y = 0;
    sprite.zIndex = 0; // Explicitly set background zIndex to 0 (or a low value)
    
    // Add to viewport
    viewport.addChild(sprite);

    // The renderer shows it as the map and destroys the sprite it replaces
    renderer.setBackgroundSprite(sprite);
    
    // Initialize grid system if it doesn't exist (crucial for streamed maps)
    const gridSystem = renderer.getGridSystem();
    if (!gridSystem) {
      // Get current grid settings from the store (for streamed maps)
      const grid = store.getState().grid;
      renderer.initGrid(grid ? toGridOptions(grid) : FALLBACK_GRID_OPTIONS, sprite);
    }
    
    // Explicitly sort children after adding the background
    viewport.sortChildren(); 
    
    // Center the map in the viewport
    viewport.moveCenter(size.width / 2, size.height / 2);
    
    // Set world size to match the map dimensions
    viewport.worldWidth = Math.max(size.width, 10000);
    viewport.worldHeight = Math.max(size.height, 10000);

    // The grid system will now handle sprite readiness checking internally
    // No need to force recreation here as the grid system will wait for the sprite to be ready
    
    // The renderer owns the sprite's removal, so the grid and the lighting learn that the map is gone
    return () => renderer.removeBackgroundSprite(sprite);
  }, [loaded, renderer]);

  // Declared after the sprite effect, so a replaced texture is released after its sprite left the viewport.
  useEffect(() => {
    if (!loaded) return;
    const { url } = loaded;
    return () => backgroundTextureCache.release(url);
  }, [loaded]);
  
  // We're not returning any JSX as we're directly manipulating the Pixi viewport
  return null;
}; 