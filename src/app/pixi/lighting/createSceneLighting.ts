import { normalizePath, type App } from 'obsidian';
import type { Application, Texture } from 'pixi.js';
import type { UnlitGrid } from '../../grid/gridLightingMark';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { LightingQualitySource } from '../../lighting/lightingQuality';
import type { SceneStore } from '../../lighting/shownTokens';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import { decodeImage, imageMimeType } from '../decodedImage';
import { requestRender } from '../RenderScheduler';
import { usesCanvasRenderer } from '../utils/rendererType';
import { CanvasLightingFallback } from './CanvasLightingFallback';
import { StoredLightingAttempt } from './lightingAttempts';
import { LightingRenderer } from './LightingRenderer';
import { showLightingUnavailableNotice } from './lightingNotices';
import { LightingViewHost } from './LightingViewHost';
import type { ExploredMemoryWatcher } from './sceneLightingView';
import type { ReadUnexploredImage } from './UnexploredImage';

export interface SceneLightingDeps {
  viewport: Viewport;
  app: Application;
  store: ViewAtlasStore;
  obsApp: App;
  measurement: () => MeasurementSettings;
  bounds: () => MapBounds | null;
  /** The map image, for the colours light bounces off. */
  albedo: () => Texture | null;
  /** The grid the composite draws unlit, while there is one (`UnlitGrid`). */
  grid?: () => UnlitGrid | null;
  /** The senses and conditions of the map's collection; the generic ones without it. */
  rules?: () => SightRules;
  /** What the tokens see, or which light reaches them, changed (`playerTokenSight`). */
  onSightChange?: () => void;
  /** Who shows the GM the engine's explored memory while it is edited. */
  exploredWatcher?: ExploredMemoryWatcher;
  /** How much the engine may ask of the graphics device (Atlas' settings on this device); the default quality without one. */
  quality?: LightingQualitySource;
  /** The store as sight and light read it (`followShownPlaces`); the store itself without one. */
  scene?: SceneStore<ViewAtlasState>;
}

/**
 * The scene lighting of a map view: the GPU engine where the graphics device runs it, the
 * line-of-sight fallback where it does not (`LightingViewHost` swaps them).
 */
export function createSceneLighting({ viewport, app, store, obsApp, measurement, bounds, albedo, grid, rules, onSightChange, exploredWatcher, quality, scene = store }: SceneLightingDeps): LightingViewHost {
  const attempt = new StoredLightingAttempt(obsApp, () => store.getState().mapPath);
  const sight = onSightChange ? { onSightChange } : {};
  const view = { ...sight, ...(rules && { rules }) };
  return new LightingViewHost({
    store,
    canvasRenderer: usesCanvasRenderer(app.renderer),
    createEngineView: (onUnavailable) => new LightingRenderer({ viewport, app, store: scene, measurement, bounds, albedo, readUnexploredImage: vaultImageReader(obsApp), attempt, onUnavailable, ...view, ...(grid && { grid }), ...(exploredWatcher && { exploredWatcher }), ...(quality && { quality }) }),
    createFallback: () => new CanvasLightingFallback({ viewport, store: scene, measurement, bounds, requestRender: () => requestRender(app), ...view }),
    forgetAttempt: () => attempt.forget(),
    notify: showLightingUnavailableNotice,
    ...sight,
  });
}

/** Decodes a vault image for the scene's fog map (`UnexploredImage`); null when the file is not there. */
function vaultImageReader(app: App): ReadUnexploredImage {
  return async (path, maxSide) => {
    const file = app.vault.getFileByPath(normalizePath(path));
    if (!file) return null;
    return decodeImage(await app.vault.readBinary(file), imageMimeType(file.extension), maxSide);
  };
}
