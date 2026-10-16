import React from 'react';
import { SettingRow } from './SettingRows';
import { ObsidianMenuDropdown } from '../ObsidianMenuDropdown';
import { UNIT_OPTIONS } from '../collection-settings/GridMeasurementTab';
import type { AtlasView } from '../../../atlas-view';
import { GRID_UNIT_TYPES, unitHolder, type UnitHolder } from '../../../gameSystems/mapUnitChange';
import { setMapUnitType } from '../../../services/mapUnits';
import { useSceneMeasurement } from './useSceneMeasurement';
import type { GridUnitType } from '../../../types/collectionSettingsTypes';
import { runInBackground } from '../../../utils/backgroundTask';
import { t } from '../../../i18n';

const GRID_UNIT_OPTIONS: Record<string, string> = Object.fromEntries(GRID_UNIT_TYPES.map((unit) => [unit, UNIT_OPTIONS[unit]]));

const HINTS: Record<UnitHolder, string> = {
  campaign: t('grid.unitOfCampaign'),
  collection: t('grid.unitOfCollection'),
  grid: t('grid.unitOfScene'),
};

const isUnitType = (value: string): value is GridUnitType => value in UNIT_OPTIONS;

/**
 * The unit this scene measures in, set where its rules come from: the played campaign's system,
 * else its collection, else (outside every collection) its own grid.
 */
export function MapUnitRow({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const scene = useSceneMeasurement(view);
  if (!view || !scene) return null;
  const { measurement } = scene;
  // Range bands name distances; there is no unit to choose.
  if (measurement.mode === 'abstract') return null;
  const holder = unitHolder(scene.rules);
  if (holder === null) return null;
  const store = view.atlasStore;

  return (
    <SettingRow label={t('grid.unit')} hint={HINTS[holder]}>
      <ObsidianMenuDropdown
        className="atlas-setting-dropdown"
        value={measurement.unitType}
        options={holder === 'grid' ? GRID_UNIT_OPTIONS : UNIT_OPTIONS}
        onChange={(value) => {
          if (isUnitType(value)) runInBackground(setMapUnitType(view.app, store, value), 'Saving the unit of measurement');
        }}
      />
    </SettingRow>
  );
}
