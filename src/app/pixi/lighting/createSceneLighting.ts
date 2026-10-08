import type { App } from 'obsidian';
import type { Application, Texture } from 'pixi.js';
import type { UnlitGrid } from '../../grid/gridLightingMark';
import type { Viewport } from 'pixi-viewport';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { LIGHTING_QUALITY, type LightingQualitySource } from '../../lighting/lightingQuality';
import { SettingsService } from '../../services/SettingsService';
import type { ViewAtlasStore } from '../../storeFactory';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import { usesCanvasRenderer } from '../utils/rendererType';
import { CanvasLightingFallback } from './CanvasLightingFallback';
import { StoredLightingAttempt } from './lightingAttempts';
import { LightingRenderer } from './LightingRenderer';
import { showLightingUnavailableNotice } from './lightingNotices';
import { LightingViewHost } from './LightingViewHost';
import type { ExploredMemoryWatcher } from './sceneLightingView';

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
}

/**
 * The scene lighting of a map view: the GPU engine where the graphics device runs it, the
 * line-of-sight fallback where it does not (`LightingViewHost` swaps them).
 */
export function createSceneLighting({ viewport, app, store, obsApp, measurement, bounds, albedo, grid, rules, onSightChange, exploredWatcher }: SceneLightingDeps): LightingViewHost {
  const attempt = new StoredLightingAttempt(obsApp, () => store.getState().mapPath);
  const sight = onSightChange ? { onSightChange } : {};
  const view = { ...sight, ...(rules && { rules }) };
  const quality = settingsQuality(obsApp);
  return new LightingViewHost({
    store,
    canvasRenderer: usesCanvasRenderer(app.renderer),
    createEngineView: (onUnavailable) => new LightingRenderer({ viewport, app, store, measurement, bounds, albedo, attempt, onUnavailable, ...view, ...(grid && { grid }), ...(exploredWatcher && { exploredWatcher }), ...(quality && { quality }) }),
    createFallback: () => new CanvasLightingFallback({ viewport, store, measurement, bounds, ...view }),
    forgetAttempt: () => attempt.forget(),
    notify: showLightingUnavailableNotice,
    ...sight,
  });
}

/** The lighting quality chosen in Atlas' settings on this device. */
function settingsQuality(obsApp: App): LightingQualitySource | undefined {
  const settings = SettingsService.forApp(obsApp);
  if (!settings) return undefined;
  return {
    current: () => LIGHTING_QUALITY[settings.getLightingQuality()],
    onChange: (listener) => settings.onChange(listener),
  };
}
