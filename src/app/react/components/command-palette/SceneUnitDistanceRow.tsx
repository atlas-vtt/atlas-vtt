import React from 'react';
import { SettingRow } from './SettingRows';
import type { AtlasView } from '../../../atlas-view';
import { sceneUnitDistance, unitLabelFor } from '../../../grid/measurementFormat';
import { typedDistance } from '../../../grid/unitDistance';
import { AssetService } from '../../../services/AssetService';
import { mapMeasurementSettings } from '../../../services/mapMeasurementSettings';

/**
 * How far one cell of this scene reaches, when its map is drawn at another scale than the
 * rest of its collection. Empty follows the collection. Written when the field is left, so
 * typing a number is one undo step; text that is no distance puts the stored one back.
 */
export function SceneUnitDistanceRow({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const store = view?.atlasStore;
  const subscribe = React.useCallback((listener: () => void): (() => void) => store?.subscribe(listener) ?? ((): void => undefined), [store]);
  // The palette does not re-render on store changes: follow undo, redo and other views here
  const stored = React.useSyncExternalStore(subscribe, () => sceneUnitDistance(store?.getState().grid));
  const [draft, setDraft] = React.useState<string | null>(null);
  const state = store?.getState();
  if (!view || !store || !state?.grid) return null;

  const assets = AssetService.getInstance(view.app);
  const measurement = mapMeasurementSettings(assets, state);
  // Range bands name distances; there is no distance per cell to change.
  if (measurement.mode === 'abstract') return null;
  const unit = unitLabelFor(measurement.unitType);
  const inCollection = !!state.mapPath && assets.getCollectionForMap(state.mapPath) !== null;
  const followed = `${measurement.ruleDistance}${unit ? ` ${unit}` : ''}`;
  const shown = stored === undefined ? '' : String(stored);

  const commit = (): void => {
    const text = draft;
    setDraft(null);
    const grid = store.getState().grid;
    if (text === null || !grid) return;
    const override = typedDistance(text);
    if (override === null || override === sceneUnitDistance(grid)) return;
    const { unitDistanceOverride: _previous, ...rest } = grid;
    store.getState().setGrid(override === undefined ? rest : { ...rest, unitDistanceOverride: override });
  };

  return (
    <SettingRow label="Distance per cell" hint={inCollection ? `Empty uses the collection's ${followed}` : `Empty uses the grid's ${followed}`}>
      <input
        type="text"
        inputMode="decimal"
        className="atlas-setting-input atlas-setting-input--sm"
        value={draft ?? shown}
        placeholder={String(measurement.ruleDistance)}
        aria-label={`Distance per cell${unit ? ` in ${unit}` : ''}`}
        onFocus={() => setDraft(shown)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </SettingRow>
  );
}
