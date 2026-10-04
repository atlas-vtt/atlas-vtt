import React, { useEffect, useRef, useState } from 'react';
import { Texture, Sprite } from 'pixi.js';
import { useAtlasUI } from './root/AtlasUIContext';
import { useViewStoreHook } from './ViewStoreContext';
import { toError } from '../utils/errors';
import type { GridOptions } from '../grid/GridSystem';
import { parseGridColor } from '../grid/gridContrastColor';
import { cellNumberStyleOfGrid } from '../grid/cellNumbering';
import { backgroundTextureCache } from '../pixi/backgroundTextureCache';
import type { GridState } from '../services/MapPersistence';

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

/** The store keeps the grid colour as a CSS hex string and its alpha as `opacity`; the GridSystem wants a number and `alpha`. */
function toGridOptions(grid: GridState): GridOptions {
  return {
    size: grid.size,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    color: parseGridColor(grid.color),
    alpha: grid.opacity,
    enabled: grid.enabled,
    ...(grid.type !== undefined ? { type: grid.type } : {}),
    ...(grid.lineType !== undefined ? { lineType: grid.lineType } : {}),
    ...(grid.lineWidth !== undefined ? { lineWidth: grid.lineWidth } : {}),
    ...(grid.scale !== undefined ? { scale: grid.scale } : {}),
    ...(grid.mapScale !== undefined ? { mapScale: grid.mapScale } : {}),
    cellNumbers: cellNumberStyleOfGrid(grid),
  };
}

interface BackgroundSpriteProps {
  imagePath: string;
  /**
   * The scene the image belongs to. The camera is centred on a new scene's map,
   * but not when an add-on swaps the image within the same scene (a map variant).
   */
  sceneKey?: string | null;
}

export const BackgroundSprite: React.FC<BackgroundSpriteProps> = ({ imagePath, sceneKey = null }) => {
  const { app, renderer } = useAtlasUI();
  const store = useViewStoreHook();
  const [texture, setTexture] = useState<Texture | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const centeredSceneRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!imagePath) return;
    let isCancelled = false;
    // Vault images are shared through the background cache; streamed maps arrive as blob URLs
    let cachedUrl: string | null = null;
    let blobUrl: string | null = null;

    const loadTexture = async (): Promise<void> => {
      try {
        let loadedTexture: Texture;
        if (imagePath.startsWith('blob:')) {
          blobUrl = imagePath;
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (err) => reject(toError(err, 'Failed to load blob image'));
            img.src = imagePath;
          });
          loadedTexture = Texture.from(img);
        } else {
          const imgFile = app.vault.getAbstractFileByPath(imagePath);
          if (!imgFile) {
            console.error(`[BackgroundSprite] Image file not found: ${imagePath}`);
            return;
          }
          const url = app.vault.adapter.getResourcePath(imgFile.path);
          cachedUrl = url;
          loadedTexture = await backgroundTextureCache.acquire(url);
        }

        if (!isCancelled) {
          setTexture(loadedTexture);
          setSize({ width: loadedTexture.width, height: loadedTexture.height });
        }
      } catch (error) {
        console.error(`[BackgroundSprite] Failed to load texture: ${imagePath}`, error);
        cachedUrl = null;
      }
    };

    void loadTexture();

    return () => {
      isCancelled = true;
      if (cachedUrl) backgroundTextureCache.release(cachedUrl);
      if (blobUrl) {
        const urlToRevoke = blobUrl;
        // Revoke after pending image operations complete
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 100);
      }
    };
  }, [imagePath, app.vault]);

  // Add/update the sprite in the viewport when texture is loaded
  useEffect(() => {
    if (!texture || !renderer) return;
    
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
    
    // Center the map in the viewport (once per scene: a swapped image keeps the camera)
    if (centeredSceneRef.current !== sceneKey || sceneKey === null) {
      viewport.moveCenter(size.width / 2, size.height / 2);
      centeredSceneRef.current = sceneKey;
    }
    
    // Set world size to match the map dimensions
    viewport.worldWidth = Math.max(size.width, 10000);
    viewport.worldHeight = Math.max(size.height, 10000);

    // The grid system will now handle sprite readiness checking internally
    // No need to force recreation here as the grid system will wait for the sprite to be ready
    
    // The renderer owns the sprite's removal, so the grid and the lighting learn that the map is gone
    return () => renderer.removeBackgroundSprite(sprite);
  }, [texture, size, renderer]);
  
  // We're not returning any JSX as we're directly manipulating the Pixi viewport
  return null;
}; 