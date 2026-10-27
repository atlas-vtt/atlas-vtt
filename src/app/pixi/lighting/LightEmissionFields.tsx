import React, { useId } from 'react';
import { BEAM_SLIDER, DIRECTION_STEP, withBeam } from '../../lighting/lightBeam';
import { editEmission } from '../../lighting/lightEmissionForm';
import { Select } from '../../packages/components/primitives/Select';
import { ToggleSwitch } from '../../packages/components/primitives/Toggle';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { LightAnimation, LightEmission } from '../../types/lightingTypes';
import { coneAngle } from '../../vision/visionCone';
import { SliderField } from './lightingPanelFields';
import { LightPresetChips } from './LightPresetChips';
import { ColorSwatches, RangeFields } from './lightPopoverFields';

const FLICKERS: { value: LightAnimation; label: string }[] = [
  { value: 'none', label: 'Steady' },
  { value: 'torch', label: 'Torch' },
  { value: 'candle', label: 'Candle' },
  { value: 'pulse', label: 'Pulse' },
  { value: 'magic', label: 'Shimmer' },
  { value: 'smoulder', label: 'Smoulder' },
];

const NOTHING = (): void => undefined;

interface LightEmissionFieldsProps {
  emission: LightEmission;
  onChange: (next: LightEmission) => void;
  /** The lights of the map's collection. */
  presets: readonly LightPresetDefinition[];
  /** "ft", "m" or nothing. */
  unit: string;
  /** Game units one grid cell spans. */
  unitDistance: number;
  /** The farthest a light may reach on this map (`maxLightRange`). */
  maxRange: number;
  /** A placed light's own direction, in degrees; a carried light faces as its token does and has none to set. */
  direction?: { degrees: number; onChange: (degrees: number) => void };
  /** The beam's width or direction was set and let go. */
  onBeamCommit?: () => void;
  /** Rows only a placed light has, among those every light has. */
  more?: React.ReactNode;
  /** A light that glows from an area: it has no beam, direction or flame, and those rows stay in place, disabled. */
  surface?: boolean;
  /** A slider is pressed, or the system colour picker opens and closes: where a host that writes at once makes the gesture one undo step. */
  onSliderPointerDown?: (event: React.PointerEvent) => void;
  onPickStart?: () => void;
  onPickEnd?: () => void;
}

/**
 * Everything a light gives off, as the light popover and Edit Token edit it: preset, colour,
 * bright and dim range, the beam it shines in, intensity, softness, flicker and whether it
 * outshines magical darkness. A placed light's direction sits beside its beam, and can be set
 * only while the light has one: the row never changes its height under the pointer. A light
 * that glows from an area keeps the beam, direction and softness rows, disabled: it shines from
 * its whole area, and its shadows are as soft as the area is wide.
 * A source of magical darkness has its kind and one radius, nothing else: it gives no light to
 * colour or dim. Every control reports the whole emission at once.
 */
export function LightEmissionFields({
  emission, onChange, presets, unit, unitDistance, maxRange, direction, more, surface = false, onBeamCommit, onSliderPointerDown = NOTHING, onPickStart = NOTHING, onPickEnd = NOTHING,
}: LightEmissionFieldsProps): React.ReactElement {
  const flickerId = useId();
  const outshinesId = useId();
  const ranges = <RangeFields emission={emission} unit={unit} unitDistance={unitDistance} maxRange={maxRange} onChange={onChange} onSliderPointerDown={onSliderPointerDown} />;
  if (emission.darkness) {
    return (
      <>
        <LightPresetChips emission={emission} presets={presets} onChange={onChange} />
        <div className="atlas-light-popover__section">{ranges}{more}</div>
      </>
    );
  }
  const beam = surface ? BEAM_SLIDER.max : coneAngle(emission.angle) ?? BEAM_SLIDER.max;
  const narrow = beam < BEAM_SLIDER.max;
  return (
    <>
      <LightPresetChips emission={emission} presets={presets} onChange={onChange} />
      <div className="atlas-light-popover__section">
        <ColorSwatches color={emission.color} onChange={(color) => onChange({ ...emission, color })} onPickStart={onPickStart} onPickEnd={onPickEnd} />
      </div>
      <div className="atlas-light-popover__section">
        {ranges}
        <div className="atlas-light-popover__beam">
          <SliderField label="Beam" value={beam} {...BEAM_SLIDER} display={surface ? '–' : narrow ? `${beam}°` : direction ? 'All' : 'All around'} disabled={surface}
            onPointerDown={onSliderPointerDown} onChange={(value) => onChange(withBeam(emission, value))} {...(onBeamCommit && { onCommit: onBeamCommit })} />
          {direction && (
            <SliderField label="Direction" value={direction.degrees} min={0} max={360 - DIRECTION_STEP} step={DIRECTION_STEP} display={narrow ? `${direction.degrees}°` : '–'}
              disabled={!narrow} onPointerDown={onSliderPointerDown} onChange={direction.onChange} {...(onBeamCommit && { onCommit: onBeamCommit })} />
          )}
        </div>
        <SliderField label="Intensity" value={emission.intensity} min={0} max={2} step={0.05} display={`${Math.round(emission.intensity * 100)} %`}
          onPointerDown={onSliderPointerDown} onChange={(value) => onChange(editEmission(emission, 'intensity', String(value)))} />
        <SliderField label="Softness" value={emission.sourceRadius ?? 1} min={0} max={5} step={0.25} display={surface ? '–' : String(emission.sourceRadius ?? 1)} disabled={surface}
          onPointerDown={onSliderPointerDown} onChange={(value) => onChange(editEmission(emission, 'sourceRadius', String(value)))} />
        <div className="atlas-light-popover__flicker">
          <span id={flickerId}>Flicker</span>
          <Select value={emission.animation} options={FLICKERS} labelledBy={flickerId} onChange={(animation) => onChange({ ...emission, animation })} />
        </div>
        {more}
        <div className="atlas-light-popover__flicker">
          <span id={outshinesId}>Outshines magical darkness</span>
          <ToggleSwitch value={(emission.priority ?? 0) > 0} labelledBy={outshinesId} onChange={() => onChange(withPriority(emission, (emission.priority ?? 0) > 0 ? 0 : 1))} />
        </div>
      </div>
    </>
  );
}

/** The light with `priority`; none is stored for 0, the priority every light and darkness has. */
function withPriority(emission: LightEmission, priority: number): LightEmission {
  const { priority: _priority, ...rest } = emission;
  return priority === 0 ? rest : { ...rest, priority };
}
