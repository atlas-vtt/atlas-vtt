import React, { useId } from 'react';
import { formatGameDistance, unitLabelFor, type MeasurementSettings } from '../../grid/measurementFormat';
import { withUnit } from '../../lighting/tokenLighting';
import { stepsByBands } from '../../measure/reachSteps';
import { BandReachSelect } from '../../react/components/measure/BandReachSelect';
import { positiveNumber } from '../../utils/numberInput';
import { NumberOverrideField, parseNumberInput } from './NumberOverrideField';
import { t } from '../../i18n';

/** What a token's speed is typed and shown in. */
export interface TokenSpeedContext {
  /** What the token's map measures in. */
  settings: MeasurementSettings;
  /** The speed the map's movement rules give a creature that states none. */
  defaultSpeed: number | undefined;
}

interface TokenSpeedFieldProps {
  /** The token's own speed in game units, as typed; empty follows its statblock, else the rules. */
  value: string;
  onChange: (value: string) => void;
  context: TokenSpeedContext;
  /** The speed the linked statblock states, if any. */
  statblockSpeed: number | undefined;
}

/**
 * What the field says while the token has no speed of its own: the speed it then moves by, and
 * where that comes from. `byBands` writes it as the range band it reaches.
 */
function inherited(statblockSpeed: number | undefined, { settings, defaultSpeed }: TokenSpeedContext, byBands: boolean): string {
  const written = (speed: number): string => (byBands ? formatGameDistance(speed, settings) : String(speed));
  if (statblockSpeed !== undefined) return t('editToken.statblockDefault', { value: written(statblockSpeed) });
  return defaultSpeed === undefined ? t('editToken.none') : t('editToken.speedDefault', { value: written(defaultSpeed) });
}

/**
 * The token's own speed: a number in the map's game unit, or one of its range bands where the
 * map names distances, held as that band's reach in game units. Left empty, the token moves by
 * its statblock's speed, else by the one its game gives creatures that state none.
 */
export function TokenSpeedField({ value, onChange, context, statblockSpeed }: TokenSpeedFieldProps): React.ReactElement {
  const labelId = useId();
  const { settings } = context;
  const byBands = settings.unitDistance > 0 && stepsByBands(settings);
  const fallback = inherited(statblockSpeed, context, byBands);
  if (!byBands) {
    return (
      <NumberOverrideField
        label={withUnit(t('editToken.speed'), unitLabelFor(settings.unitType, settings.unitName))}
        value={value}
        onChange={onChange}
        placeholder={fallback}
        resetLabel={t('editToken.resetStatblock')}
      />
    );
  }
  return (
    <div className="atlas-edit-token__field">
      <span id={labelId} className="atlas-edit-token__label">{t('editToken.speed')}</span>
      <BandReachSelect
        value={positiveNumber(parseNumberInput(value))}
        onChange={(speed) => onChange(speed === undefined ? '' : String(speed))}
        settings={settings}
        noneLabel={fallback}
        labelledBy={labelId}
      />
    </div>
  );
}
