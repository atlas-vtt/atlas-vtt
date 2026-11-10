/**
 * GridMeasurementTab — How the collection measures: what its ruler shows, what one square spans,
 * diagonals, difficult terrain and cones, and the range bands of a ruler that names distances.
 */

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { UnitDistanceField } from './UnitDistanceField';
import { SettingRow } from './SettingRow';
import { areRangeBandsValid, DEFAULT_CONE_ANGLE, isValidConeAngle, isValidRangeBandThreshold } from '../../../grid/measurementFormat';
import { isUnitDistance } from '../../../grid/unitDistance';
import type {
  CollectionGridDefaults,
  DiagonalRule,
  DifficultTerrainRule,
  GridUnitType,
  MeasurementMode,
  RangeBand,
} from '../../../types/collectionSettingsTypes';
import { t } from '../../../i18n';

const MEASUREMENT_MODES: readonly SegmentedOption<MeasurementMode>[] = [
  { value: 'metric', label: t('csm.grid.metric') },
  { value: 'abstract', label: t('csm.grid.abstract') },
];

interface GridMeasurementTabProps {
  gridDefaults: CollectionGridDefaults;
  /** The angle the collection measures cones with, its system's while it has none of its own. Defaults to its own. */
  coneAngle?: number;
  /** What difficult terrain costs the collection's movement, its system's while it has no rule of its own. Defaults to its own. */
  difficultTerrain?: DifficultTerrainRule;
  onChange: (gridDefaults: CollectionGridDefaults) => void;
}

/** The units a measurement can name, as the settings label them. */
export const UNIT_OPTIONS: Record<GridUnitType, string> = {
  feet: t('csm.grid.unit.feet'),
  yards: t('csm.grid.unit.yards'),
  meters: t('csm.grid.unit.meters'),
  units: t('csm.grid.unit.units'),
  custom: t('csm.grid.unit.custom'),
};

const UNIT_SELECT: SelectOption<GridUnitType>[] = (Object.keys(UNIT_OPTIONS) as GridUnitType[]).map((value) => ({ value, label: UNIT_OPTIONS[value] }));

const DIAGONAL_OPTIONS: SelectOption<DiagonalRule>[] = [
  { value: 'equidistant', label: t('csm.grid.diagonal.equidistant') },
  { value: 'alternating', label: t('csm.grid.diagonal.alternating') },
  { value: 'euclidean', label: t('csm.grid.diagonal.euclidean') },
];

export function GridMeasurementTab({
  gridDefaults,
  coneAngle,
  difficultTerrain,
  onChange,
}: GridMeasurementTabProps): React.ReactElement {
  const difficultDoubles = (difficultTerrain ?? gridDefaults.difficultTerrain ?? 'none') === 'double';
  const updateField = <K extends keyof CollectionGridDefaults>(
    key: K,
    value: CollectionGridDefaults[K],
  ): void => {
    onChange({ ...gridDefaults, [key]: value });
  };

  return (
    <>
      <section className="atlas-csm-section" aria-labelledby="atlas-csm-grid-title">
        <h4 id="atlas-csm-grid-title" className="atlas-csm-section-title">{t('csm.grid.title')}</h4>
        <SettingRow
          label={t('csm.grid.mode')}
          info={t('csm.grid.modeInfo')}
          control={() => (
            <SegmentedControl
              ariaLabel={t('csm.grid.mode')}
              value={gridDefaults.measurementMode}
              options={MEASUREMENT_MODES}
              onChange={(mode) => updateField('measurementMode', mode)}
            />
          )}
        />
        <SettingRow
          label={t('csm.grid.distance')}
          info={t('csm.grid.distanceInfo')}
          control={(labelId) => (
            <span className="atlas-csm-square">
              <UnitDistanceField labelledBy={labelId} value={gridDefaults.unitDistance} onChange={(distance) => updateField('unitDistance', distance)} />
              <span className="atlas-csm-square__unit">
                <Select value={gridDefaults.unitType} options={UNIT_SELECT} labelledBy={labelId} onChange={(unit) => updateField('unitType', unit)} />
              </span>
            </span>
          )}
        >
          {!isUnitDistance(gridDefaults.unitDistance) && (
            <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('csm.grid.distanceInvalid')}</p>
          )}
        </SettingRow>
        <SettingRow
          label={t('csm.grid.diagonal')}
          info={t('csm.grid.diagonalInfo')}
          control={(labelId) => (
            <Select value={gridDefaults.diagonalRule ?? 'equidistant'} options={DIAGONAL_OPTIONS} labelledBy={labelId}
              onChange={(rule) => updateField('diagonalRule', rule)} />
          )}
        />
        <SettingRow
          label={t('csm.grid.difficultTerrain')}
          info={t('csm.grid.difficultTerrainHint')}
          control={(labelId) => (
            <ToggleSwitch labelledBy={labelId} value={difficultDoubles}
              onChange={() => updateField('difficultTerrain', difficultDoubles ? 'none' : 'double')} />
          )}
        />
        <SettingRow
          label={t('csm.grid.coneAngle')}
          info={t('csm.grid.coneAngleInfo')}
          control={(labelId) => (
            <span className="atlas-csm-suffixed">
              <input
                type="number"
                className="atlas-csm-input atlas-csm-input--number"
                aria-labelledby={labelId}
                min={1}
                max={360}
                value={coneAngle ?? gridDefaults.coneAngle ?? DEFAULT_CONE_ANGLE}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (isValidConeAngle(val)) updateField('coneAngle', val);
                }}
              />
              <span aria-hidden="true" className="atlas-csm-suffixed__unit">°</span>
            </span>
          )}
        />
      </section>

      {gridDefaults.measurementMode === 'abstract' && (
        <RangeBandsSection bands={gridDefaults.abstractRangeBands ?? []} onChange={(bands) => updateField('abstractRangeBands', bands)} />
      )}
    </>
  );
}

/** The names a ruler that names distances gives, each up to a number of squares. */
function RangeBandsSection({ bands, onChange }: { bands: RangeBand[]; onChange: (bands: RangeBand[]) => void }): React.ReactElement {
  const bandsValid = areRangeBandsValid(bands);
  const updateBand = (index: number, partial: Partial<RangeBand>): void => {
    onChange(bands.map((b, i) => (i === index ? { ...b, ...partial } : b)));
  };

  return (
    <section className="atlas-csm-section" aria-labelledby="atlas-csm-bands-title">
      <h4 id="atlas-csm-bands-title" className="atlas-csm-section-title">{t('csm.grid.bands')}</h4>
      {bands.length > 0 ? (
        <div className="atlas-csm-band-list">
          {bands.map((band, i) => {
            const thresholdValid = isValidRangeBandThreshold(band.maxSquares);
            return (
              <div key={i} className="atlas-csm-band-row">
                <input
                  type="text"
                  className="atlas-csm-input"
                  placeholder={t('csm.grid.bandName')}
                  value={band.name}
                  onChange={(e) => updateBand(i, { name: e.target.value })}
                />
                <input
                  type="number"
                  className="atlas-csm-input atlas-csm-input--number"
                  min={1}
                  step={1}
                  placeholder={t('csm.grid.max')}
                  aria-invalid={!thresholdValid || undefined}
                  value={Number.isNaN(band.maxSquares) ? '' : band.maxSquares}
                  onChange={(e) => {
                    // Keep whatever was typed, even an empty field; Save stays disabled until it is valid.
                    const raw = e.target.value.trim();
                    updateBand(i, { maxSquares: raw === '' ? NaN : Number(raw) });
                  }}
                />
                <LabelTooltip label={t('csm.grid.removeBand')}>
                  <Button variant="ghost" size="icon" className="atlas-csm-band-delete" onClick={() => onChange(bands.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </LabelTooltip>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="atlas-csm-empty">{t('csm.grid.noBands')}</div>
      )}
      {!bandsValid && (
        <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{t('csm.grid.bandsInvalid')}</p>
      )}
      <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => onChange([...bands, { name: '', maxSquares: 1 }])}>
        <Plus />
        {t('csm.grid.addBand')}
      </Button>
    </section>
  );
}
