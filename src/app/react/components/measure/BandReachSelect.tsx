import React from 'react';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { bandReachChoices, bandReachOf } from '../../../measure/reachSteps';

/** The choice of no band at all. */
const NONE = 'none';

/** What a band's reach is worked out from: the map's bands and what one cell spans. */
export type BandReachSettings = Pick<MeasurementSettings, 'mode' | 'rangeBands' | 'unitDistance'>;

interface BandReachSelectProps {
  /** The reach in game units; undefined is none. */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  settings: BandReachSettings;
  /** What the choice of no band says. */
  noneLabel: string;
  labelledBy: string;
}

/**
 * A reach chosen as one of the map's range bands, or none. It is held in game units as every
 * reach is: the band's cells times what a cell spans, kept to thousandths. A reach that is no
 * band's own shows as the band it is written as.
 */
export function BandReachSelect({ value, onChange, settings, noneLabel, labelledBy }: BandReachSelectProps): React.ReactElement {
  const options: SelectOption<string>[] = [
    { value: NONE, label: noneLabel },
    ...bandReachChoices(settings).map((band) => ({ value: String(band.cells), label: band.name })),
  ];
  const band = value === undefined ? undefined : bandReachOf(value / settings.unitDistance, settings);
  return (
    <Select
      value={band ? String(band.cells) : NONE}
      options={options}
      labelledBy={labelledBy}
      onChange={(next) => onChange(next === NONE ? undefined : Math.round(Number(next) * settings.unitDistance * 1000) / 1000)}
    />
  );
}
