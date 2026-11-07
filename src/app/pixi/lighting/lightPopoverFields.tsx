import React, { useEffect, useId, useState } from 'react';
import { DropdownSwatchGrid } from '../../packages/components/primitives/DropdownSwatchGrid';
import { Slider } from '../../packages/components/primitives/slider';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { editEmission, withEmissionValue } from '../../lighting/lightEmissionForm';
import { formatRange, rangeSliderScale, type RangeField } from '../../lighting/lightRanges';
import type { LightEmission } from '../../types/lightingTypes';
import { useColourPick, type ColourPick } from './useGestureTransactions';
import { t } from '../../i18n';

interface EmissionFieldProps {
  emission: LightEmission;
  onChange: (next: LightEmission) => void;
}

/** Colours lights commonly have: the kinds' own, and a few for magic. */
const LIGHT_COLOR_SWATCHES = [
  { value: '#ffb347', label: t('light.colour.candle') },
  { value: '#ff9a3c', label: t('light.colour.torch') },
  { value: '#ffd28a', label: t('light.colour.lantern') },
  { value: '#fff1d6', label: t('light.colour.warm') },
  { value: '#8fb8ff', label: t('light.colour.arcane') },
  { value: '#7ee0a8', label: t('light.colour.fey') },
  { value: '#ff6b5e', label: t('light.colour.ember') },
] as const;

/** The light's colour: common ones as swatches, any other from the system picker in the last cell. */
export function ColorSwatches({ color, ...pick }: ColourPick & { color: string }): React.ReactElement {
  const input = useColourPick(pick);
  const custom = !LIGHT_COLOR_SWATCHES.some((swatch) => swatch.value === color.toLowerCase());
  return (
    <DropdownSwatchGrid label={t('light.colourLabel')} swatches={LIGHT_COLOR_SWATCHES} value={color} onChange={pick.onChange}>
      <span className={`atlas-swatch atlas-swatch--custom${custom ? ' atlas-swatch--active' : ''}`} style={custom ? { background: color } : undefined}>
        <LabelTooltip label={t('light.customColour')}>
          <input ref={input.ref} type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff'} onChange={input.onChange} />
        </LabelTooltip>
      </span>
    </DropdownSwatchGrid>
  );
}

interface RangeFieldsProps extends EmissionFieldProps {
  /** "ft", "m" or nothing. */
  unit: string;
  /** Game units one grid cell spans. */
  unitDistance: number;
  /** The farthest a light may reach on this map (`maxLightRange`). */
  maxRange: number;
  onSliderPointerDown: (event: React.PointerEvent) => void;
}

/**
 * Bright and dim range: typed exactly, or dragged on one slider whose two thumbs cannot cross,
 * as dim is never below bright. The rings on the map show the same two ranges.
 */
export function RangeFields({ emission, unit, unitDistance, maxRange, onChange, onSliderPointerDown }: RangeFieldsProps): React.ReactElement {
  const { max, step } = rangeSliderScale(unitDistance, emission.dim);
  // A source of magical darkness has one radius, where it ends.
  if (emission.darkness) {
    return (
      <div className="atlas-light-popover__field">
        <div className="atlas-light-popover__ranges">
          <RangeInput label={t('light.radius')} field="dim" emission={emission} maxRange={maxRange} onChange={onChange} />
          {unit && <span className="atlas-light-popover__unit">{unit}</span>}
        </div>
        <Slider
          value={[emission.dim]}
          min={0}
          max={Math.min(max, maxRange)}
          step={step}
          thumbLabels={[t('light.darknessRadius')]}
          getValueText={(value) => `${formatRange(value)} ${unit}`.trim()}
          onPointerDown={onSliderPointerDown}
          onValueChange={([dim]) => {
            if (dim !== undefined && dim !== emission.dim) onChange(withEmissionValue(emission, 'dim', dim, maxRange));
          }}
        />
      </div>
    );
  }
  return (
    <div className="atlas-light-popover__field">
      <div className="atlas-light-popover__ranges">
        <RangeInput label={t('light.bright')} field="bright" emission={emission} maxRange={maxRange} onChange={onChange} />
        <RangeInput label={t('light.dim')} field="dim" emission={emission} maxRange={maxRange} onChange={onChange} />
        {unit && <span className="atlas-light-popover__unit">{unit}</span>}
      </div>
      <Slider
        value={[emission.bright, emission.dim]}
        min={0}
        max={Math.min(max, maxRange)}
        step={step}
        thumbLabels={[t('light.brightRange'), t('light.dimRange')]}
        getValueText={(value) => `${formatRange(value)} ${unit}`.trim()}
        onPointerDown={onSliderPointerDown}
        onValueChange={([bright, dim]) => {
          if (bright !== undefined && bright !== emission.bright) onChange(withEmissionValue(emission, 'bright', bright, maxRange));
          else if (dim !== undefined && dim !== emission.dim) onChange(withEmissionValue(emission, 'dim', dim, maxRange));
        }}
      />
    </div>
  );
}

interface RangeInputProps extends EmissionFieldProps {
  label: string;
  field: RangeField;
  maxRange: number;
}

/**
 * Commits on Enter or when it loses focus, so half-typed numbers never reach the light. A range
 * past `maxRange` stops there and the field shows it; text that is no number puts the range back.
 */
function RangeInput({ label, field, emission, maxRange, onChange }: RangeInputProps): React.ReactElement {
  const id = useId();
  const value = formatRange(emission[field]);
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (): void => {
    const next = editEmission(emission, field, text, maxRange);
    // Also when the range stays as it is: the field shows the range, not what was typed.
    setText(formatRange(next[field]));
    if (next !== emission) onChange(next);
  };
  return (
    <label className="atlas-light-popover__range" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          // The field takes the key: a dialog around it does not save on it.
          event.preventDefault();
          commit();
        }}
      />
    </label>
  );
}
