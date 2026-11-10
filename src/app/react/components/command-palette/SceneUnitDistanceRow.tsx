import React from 'react';
import { SettingRow } from './SettingRows';
import type { AtlasView } from '../../../atlas-view';
import { sceneUnitDistance, unitLabelFor } from '../../../grid/measurementFormat';
import { typedDistance } from '../../../grid/unitDistance';
import { useSceneMeasurement } from './useSceneMeasurement';
import { t } from '../../../i18n';

/**
 * How far one cell of this scene reaches, when its map is drawn at another scale than the
 * rest of the rules it plays by. Empty follows those rules. Written when the field is left, so
 * typing a number is one undo step; text that is no distance puts the stored one back.
 */
export function SceneUnitDistanceRow({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const scene = useSceneMeasurement(view);
  const [draft, setDraft] = React.useState<string | null>(null);
  if (!view || !scene) return null;

  const { measurement } = scene;
  // Range bands name distances; there is no distance per cell to change.
  if (measurement.mode === 'abstract') return null;
  const store = view.atlasStore;
  const stored = sceneUnitDistance(scene.state.grid);
  const unit = unitLabelFor(measurement.unitType);
  const { kind } = scene.rules.source;
  const distance = `${measurement.ruleDistance}${unit ? ` ${unit}` : ''}`;
  const hint = kind === 'campaign' ? t('grid.distanceFromCampaign', { distance })
    : kind === 'collection' ? t('grid.distanceFromCollection', { distance })
      : t('grid.distanceFromGrid', { distance });
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
    <SettingRow label={t('grid.distancePerCell')} hint={hint}>
      <input
        type="text"
        inputMode="decimal"
        className="atlas-setting-input atlas-setting-input--sm"
        value={draft ?? shown}
        placeholder={String(measurement.ruleDistance)}
        aria-label={unit ? t('grid.distancePerCellIn', { unit }) : t('grid.distancePerCell')}
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
