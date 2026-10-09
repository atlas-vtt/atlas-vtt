import type { App } from 'obsidian';
import { MapLoader, mapImageSourceFor } from './MapLoader';
import type { MapFile } from './services/MapPersistence';
import { MAP_THUMBNAIL_SIZE } from './services/MapThumbnailService';
import type { PixiRendererOrchestrator } from './PixiRendererOrchestrator';
import type { GridOptions } from './grid/GridSystem';
import { parseGridColor } from './grid/gridContrastColor';
import { cellNumberStyleOfGrid } from './grid/cellNumbering';
import { MapImage } from './pixi/mapImage/MapImage';
import { MapImageService } from './pixi/mapImage/MapImageService';
import { fitMapRect } from './pixi/fitMapRect';
import { requestRender } from './pixi/RenderScheduler';
import { prefersReducedMotion } from './utils/motion';
import type { ViewAtlasStore } from './storeFactory';

export interface DisplayedMap {
  mapData: MapFile;
}

/** The part of the renderer a map load shows its map through. */
type MapRenderer = Pick<
  PixiRendererOrchestrator,
  'getMapImage' | 'setMapImage' | 'getAppInstance' | 'getViewportInstance' | 'getGridSystem' | 'initGrid'
>;

/** The store background each map image shows, as the load or the store's change that showed it named it. */
const shownBackground = new WeakMap<MapImage, string | null>();

/** The view's map image, made and handed to the renderer on the first load; null without a viewport. */
function viewMapImage(app: App, renderer: MapRenderer): MapImage | null {
  const existing = renderer.getMapImage();
  if (existing) return existing;
  const viewport = renderer.getViewportInstance();
  if (!viewport) return null;
  const pixi = renderer.getAppInstance();
  const mapImage = new MapImage({
    service: MapImageService.forApp(app),
    viewport,
    ticker: pixi.ticker,
    renderer: pixi.renderer,
    requestRender: () => requestRender(pixi),
    reducedMotion: () => prefersReducedMotion(pixi.canvas),
    picture: MAP_THUMBNAIL_SIZE,
  });
  renderer.setMapImage(mapImage);
  return mapImage;
}

/**
 * Load the given map file, show its map image, initialise grid and
 * return the parsed mapData. Returns null without touching the renderer when
 * `isSuperseded` reports that a newer load took over while the file was read.
 */
async function loadAndDisplay(
  app: App,
  renderer: MapRenderer,
  filePath: string,
  restoreCamera: boolean = true,
  isSuperseded: () => boolean = () => false,
): Promise<DisplayedMap | null> {
  const { mapData, image } = await MapLoader.load(app, filePath);
  if (isSuperseded()) return null;

  const mapImage = viewMapImage(app, renderer);
  if (mapImage) {
    shownBackground.set(mapImage, mapData.background ?? null);
    await mapImage.load(image);
    if (isSuperseded()) return null;
  }

  // Prepare grid options derived from map meta – but always start enabled so
  // the user instantly sees it and can toggle off later.
  // Check if we have a more recent offset in the renderer's grid system
  const currentGridSystem = renderer.getGridSystem();
  const currentOffset = currentGridSystem ? {
    x: currentGridSystem.getOptions().offsetX ?? 0,
    y: currentGridSystem.getOptions().offsetY ?? 0
  } : { x: 0, y: 0 };

  // Use current offset if grid system exists, otherwise use map data
  const shouldUseCurrentOffset = currentGridSystem !== null;

  const gridOptions: GridOptions = {
    type: mapData.grid?.type ?? 'square',
    size: mapData.grid?.size ?? 70,
    offsetX: shouldUseCurrentOffset ? currentOffset.x : (mapData.grid?.offsetX ?? 0),
    offsetY: shouldUseCurrentOffset ? currentOffset.y : (mapData.grid?.offsetY ?? 0),
    color: parseGridColor(mapData.grid?.color),
    alpha: mapData.grid?.opacity ?? 0.7,
    cellNumbers: cellNumberStyleOfGrid(mapData.grid),
    enabled: true,
  } as const;

  if (mapImage) renderer.initGrid(gridOptions, mapImage);

  // Restore camera state if present, otherwise center and fit
  const viewport = renderer.getViewportInstance();
  if (viewport) {
    // Always center and fit on initial load, unless explicitly restoring camera
    // Check if camera has valid values (not just default 0,0,1)
    const hasValidCamera = mapData.camera &&
                         (mapData.camera.x !== 0 || mapData.camera.y !== 0 || mapData.camera.scale !== 1);

    const worldRect = mapImage?.worldRect;
    if (restoreCamera && hasValidCamera) {
      // Restore saved camera position
      viewport.moveCenter(mapData.camera.x, mapData.camera.y);
      viewport.setZoom(mapData.camera.scale);
    } else if (worldRect) {
      fitMapRect(viewport, worldRect);
    }
  } else {
    console.warn('[MapController] Viewport not available for camera positioning');
  }

  // Ensure in‑memory map data reflects current grid enabled status so the UI
  // shows the correct state.
  if (mapData.grid) {
    mapData.grid.enabled = true;
  } else {
    mapData.grid = {
      enabled: true,
      size: gridOptions.size,
      offsetX: gridOptions.offsetX ?? 0,
      offsetY: gridOptions.offsetY ?? 0,
      opacity: 0.7,
    };
  }

  return { mapData };
}

/**
 * Shows the store's background whenever it changes outside a load (undo or redo of a background
 * change, a missing image removed): the image loads into the same map image. Returns the unsubscribe.
 */
function followBackground(app: App, store: ViewAtlasStore, mapImage: MapImage): () => void {
  return store.subscribe((state) => state.background, (background) => {
    const state = store.getState();
    // A load sets the background itself and shows the image of its file.
    if (!state.mapLoaded || state.isMapLoading) return;
    if (shownBackground.get(mapImage) === background) return;
    shownBackground.set(mapImage, background);
    void mapImage.load(mapImageSourceFor(app, background, state.grid?.size));
  });
}

/**
 * Handles loading map resources and initialising renderer state.
 */
export const MapController = { loadAndDisplay, followBackground };
