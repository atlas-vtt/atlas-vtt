import React from 'react';
import { SettingRow } from './SettingRows';
import type { AtlasView } from '../../../atlas-view';
import { MAX_UNIT_NAME, readUnitName, sceneUnitName, unitLabelFor } from '../../../grid/measurementFormat';
import { useSceneMeasurement } from './useSceneMeasurement';
import { t } from '../../../i18n';

/**
 * The unit this scene's distances are shown in, when its map is measured in another one than the
 * rest of the rules it plays by (a galaxy map in light years). Empty follows those rules. Written
 * when the field is left, so typing a name is one undo step.
 */
export function SceneUnitNameRow({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const scene = useSceneMeasurement(view);
  const [draft, setDraft] = React.useState<string | null>(null);
  if (!view || !scene) return null;

  const { measurement } = scene;
  // Range bands name distances; there is no unit to name.
  if (measurement.mode === 'abstract') return null;
  const store = view.atlasStore;
  const shown = sceneUnitName(scene.state.grid) ?? '';

  const commit = (): void => {
    const text = draft;
    setDraft(null);
    const grid = store.getState().grid;
    if (text === null || !grid) return;
    const name = readUnitName(text);
    if (name === sceneUnitName(grid)) return;
    const { unitNameOverride: _previous, ...rest } = grid;
    store.getState().setGrid(name === undefined ? rest : { ...rest, unitNameOverride: name });
  };

  return (
    <SettingRow label={t('grid.unitName')} hint={t('grid.unitNameHint')}>
      <input
        type="text"
        className="atlas-setting-input atlas-setting-input--sm"
        value={draft ?? shown}
        maxLength={MAX_UNIT_NAME}
        placeholder={unitLabelFor(measurement.unitType)}
        aria-label={t('grid.unitName')}
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
