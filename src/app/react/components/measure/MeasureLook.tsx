import React, { useMemo } from 'react';
import { unitLabelFor } from '../../../grid/measurementFormat';
import { t } from '../../../i18n';
import { readEmission } from '../../../lighting/lightingObjects';
import { maxLightRange } from '../../../lighting/lightRanges';
import { unitScaleOf } from '../../../lighting/lightingUnits';
import type { MeasureEffect } from '../../../measure/measureEffects';
import { canBeDarkness, effectChoice, startingLight } from '../../../measure/measureLights';
import type { KeptMeasure, MeasureChanges } from '../../../measure/measureTypes';
import { MeasureEffectChips } from '../../../packages/components/toolbar/MeasureEffectChips';
import { FlickerField, RangeFields } from '../../../pixi/lighting/lightPopoverFields';
import { useGestureTransactions } from '../../../pixi/lighting/useGestureTransactions';
import { cssColorToHexNumber, getObsidianAccentColor, hexColorOf } from '../../../pixi/utils/colorUtils';
import { mapMeasurementSettings } from '../../../services/mapMeasurementSettings';
import { rulesLookup } from '../../../services/mapRules';
import type { LightEmission } from '../../../types/lightingTypes';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../../ViewStoreContext';
import { SwitchRow } from './SwitchRow';

/**
 * The look of a kept area and the light it gives. The effect chips: choosing one is one write, the
 * look with the colour and the light it starts with (`effectChoice`). Then the switch that makes the
 * area a light of the scene, with its two ranges and its flicker folded under it while it is on.
 * A circle with Shadow is a magical darkness as wide as itself in the light's place, so the switch
 * says that and has nothing under it. On a scene without dynamic lighting, and for Shadow on a
 * shape that has no radius, the switch is shown as it is and says why it cannot be pressed.
 */
export function MeasureLook({ measure }: { measure: KeptMeasure }): React.ReactElement {
  const store = useViewStoreHook();
  const { app } = useAtlasUI();
  const rules = useMemo(() => rulesLookup(app), [app]);
  const lit = useAtlasStore((state) => state.lighting.enabled);
  const unitType = useAtlasStore((state) => mapMeasurementSettings(rules, state).unitType);
  const unitName = useAtlasStore((state) => mapMeasurementSettings(rules, state).unitName);
  const unitDistance = useAtlasStore((state) => mapMeasurementSettings(rules, state).unitDistance);
  const cellSize = useAtlasStore((state) => state.grid?.size ?? 0);
  const scale = useMemo(() => unitScaleOf({ unitDistance }, { size: cellSize }), [unitDistance, cellSize]);
  const { onSliderPointerDown } = useGestureTransactions(store);

  const emission = readEmission(measure.light);
  const round = canBeDarkness(measure.shape);
  const shadow = measure.effect === 'shadow';
  const dark = emission ? emission.darkness === true : shadow && round;
  const unavailable = !lit ? t('measure.sceneUnlit') : shadow && !round && !emission ? t('measure.shadowNeedsCircle') : null;
  const accent = (): string => hexColorOf(cssColorToHexNumber(getObsidianAccentColor()));
  const update = (changes: MeasureChanges): void => store.getState().updateMeasure(measure.id, changes);
  const choose = (effect: MeasureEffect | null): void => update(effectChoice(measure, effect, { scale, lit, accent: accent() }));
  const relight = (light: LightEmission): void => {
    if (light !== emission) update({ light });
  };

  return (
    <>
      <MeasureEffectChips value={measure.effect ?? null} color={measure.color ?? null} onChange={choose} />
      <div className="atlas-light-popover__section">
        <SwitchRow
          label={dark ? t('measure.magicalDarkness') : t('measure.givesLight')}
          value={emission !== null}
          unavailable={unavailable}
          onChange={(on) => update({ light: on ? startingLight(measure, measure.effect, scale, measure.color ?? accent()) : undefined })}
        />
        {emission && !emission.darkness && lit && (
          <>
            <RangeFields emission={emission} unit={unitLabelFor(unitType, unitName)} unitDistance={unitDistance} maxRange={maxLightRange(scale)} onChange={relight} onSliderPointerDown={onSliderPointerDown} />
            <FlickerField emission={emission} onChange={relight} />
          </>
        )}
      </div>
    </>
  );
}
