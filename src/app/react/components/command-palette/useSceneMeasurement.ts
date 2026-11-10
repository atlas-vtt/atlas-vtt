import { useCallback, useSyncExternalStore } from 'react';
import type { AtlasView } from '../../../atlas-view';
import { rulesForMap, type MapRules } from '../../../gameSystems/mapRules';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { mapMeasurementSettings } from '../../../services/mapMeasurementSettings';
import { rulesLookup } from '../../../services/mapRules';
import type { ViewAtlasState } from '../../../storeFactory';
import { useMapRulesRevision } from '../../hooks/useMapRulesRevision';

export interface SceneMeasurement {
  readonly state: ViewAtlasState;
  /** What the scene measures in (`mapMeasurementSettings`). */
  readonly measurement: MeasurementSettings;
  /** The rules it plays by, and where they come from. */
  readonly rules: MapRules;
}

/**
 * How the view's scene measures, for the palette's grid rows; null without a scene or grid. The
 * palette does not re-render on store changes or rule edits, so this follows the grid (undo, redo,
 * other views) and the rules (`useMapRulesRevision`) itself.
 */
export function useSceneMeasurement(view: AtlasView | null): SceneMeasurement | null {
  const store = view?.atlasStore;
  const subscribe = useCallback((listener: () => void): (() => void) => store?.subscribe(listener) ?? ((): void => undefined), [store]);
  useSyncExternalStore(subscribe, () => store?.getState().grid);
  useMapRulesRevision(view?.app);
  const state = store?.getState();
  if (!view || !state?.grid) return null;
  const lookup = rulesLookup(view.app);
  return { state, measurement: mapMeasurementSettings(lookup, state), rules: rulesForMap(lookup, state.mapPath) };
}
