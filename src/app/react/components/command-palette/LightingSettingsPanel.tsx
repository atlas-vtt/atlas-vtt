import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { t } from '../../../i18n';
import {
  DEFAULT_EXPLORED_COLOR,
  DEFAULT_UNEXPLORED_COLOR,
  darkSightLookOf,
  darkSightTintOf,
  exploredMemoryOn,
  litThresholdOf,
  sightOnDropOn,
  tokenVisionOn,
} from '../../../lighting/sceneLightingOptions';
import type { DarkSightLook } from '../../../types/lightingTypes';
import { useAtlasStore } from '../../ViewStoreContext';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { SettingChoiceRow, SettingRow, SettingSliderRow, SettingToggleRow } from './SettingRows';

const DARK_SIGHT_LOOK_OPTIONS: readonly SegmentedOption<DarkSightLook>[] = [
  { value: 'system', label: t('sceneLight.look.system') },
  { value: 'grey', label: t('sceneLight.look.grey') },
  { value: 'colour', label: t('sceneLight.look.colour') },
];

interface ColourRowProps {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (colour: string) => void;
  /** Controls before the swatch, e.g. the button that takes a colour back. */
  children?: React.ReactNode;
}

/** A colour from the system picker, picked in sRGB. */
function ColourRow({ label, value, disabled, onChange, children }: ColourRowProps): React.ReactElement {
  const labelId = React.useId();
  return (
    <SettingRow label={label} labelId={labelId}>
      {children}
      <input type="color" className="atlas-swatch atlas-swatch--picker" aria-labelledby={labelId} value={value} disabled={disabled}
        onChange={(event) => onChange(event.target.value)} />
    </SettingRow>
  );
}

/**
 * The Lighting page of the command palette: how the scene's lighting treats sight and memory, and
 * how what players remember and see in the dark looks. The lighting tool's menu keeps what changes
 * during play (time of day, ambient light) and the same switch. Changes apply at once and are never
 * undo steps; while dynamic lighting is off everything but its switch is shown disabled.
 */
export function LightingSettingsPanel(): React.ReactElement {
  const lighting = useAtlasStore((state) => state.lighting);
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting);
  const { view } = useAtlasUI();
  // The value shows live while dragging and reaches the scene on release: every step would
  // rebuild sight and record explored memory, and a pass below the ambient level would record
  // everything in sight for good.
  const [dragged, setDragged] = useState<number | null>(null);
  const threshold = dragged ?? Math.round(litThresholdOf(lighting) * 100);
  const off = !lighting.enabled;
  const tint = darkSightTintOf(lighting);

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <SettingToggleRow label={t('sceneLight.dynamic')} value={lighting.enabled} onToggle={() => setSceneLighting({ enabled: !lighting.enabled })} />
        <SettingToggleRow
          label={t('sceneLight.tokenVision')}
          hint={t('sceneLight.tokenVisionOn')}
          hintOff={t('sceneLight.tokenVisionOff')}
          value={tokenVisionOn(lighting)}
          disabled={off}
          onToggle={() => setSceneLighting({ tokenVision: !tokenVisionOn(lighting) })}
        />
        <SettingToggleRow
          label={t('sceneLight.memory')}
          hint={t('sceneLight.memoryOn')}
          hintOff={t('sceneLight.memoryOff')}
          value={exploredMemoryOn(lighting)}
          disabled={off}
          onToggle={() => setSceneLighting({ exploredMemory: !exploredMemoryOn(lighting) })}
        />
        <SettingToggleRow
          label={t('sceneLight.sightOnDrop')}
          hint={t('sceneLight.sightOnDropOn')}
          hintOff={t('sceneLight.sightOnDropOff')}
          value={sightOnDropOn(lighting)}
          disabled={off}
          // Off is the default and is stored as no choice at all.
          onToggle={() => setSceneLighting({ sightOnDrop: sightOnDropOn(lighting) ? undefined : true })}
        />
        <SettingSliderRow label={t('sceneLight.litFrom')} value={threshold} min={0} max={100} step={1} displayValue={`${threshold} %`} disabled={off}
          onChange={setDragged}
          onCommit={(percent) => {
            setDragged(null);
            setSceneLighting({ litThreshold: percent / 100 });
          }} />
      </div>
      <div className="atlas-command-palette-panel-column">
        <ColourRow label={t('sceneLight.exploredColour')} value={lighting.exploredColor ?? DEFAULT_EXPLORED_COLOR} disabled={off}
          onChange={(exploredColor) => setSceneLighting({ exploredColor })} />
        <ColourRow label={t('sceneLight.unexploredColour')} value={lighting.unexploredColor ?? DEFAULT_UNEXPLORED_COLOR} disabled={off}
          onChange={(unexploredColor) => setSceneLighting({ unexploredColor })} />
        {/* Only the picture of what senses without colour show; the system's look and no tint are stored as unset. */}
        <SettingChoiceRow label={t('sceneLight.darkSightLook')}>
          <SegmentedControl<DarkSightLook> value={darkSightLookOf(lighting)} options={DARK_SIGHT_LOOK_OPTIONS} ariaLabel={t('sceneLight.darkSightLook')} disabled={off}
            onChange={(look) => setSceneLighting({ darkSightLook: look === 'system' ? undefined : look })} />
        </SettingChoiceRow>
        <ColourRow label={t('sceneLight.darkSightTint')} value={tint ?? '#ffffff'} disabled={off} onChange={(darkSightTint) => setSceneLighting({ darkSightTint })}>
          <Button variant="ghost" size="sm" disabled={off || tint === null} onClick={() => setSceneLighting({ darkSightTint: undefined })}>{t('sceneLight.noTint')}</Button>
        </ColourRow>
        <div className="atlas-setting-actions">
          <Button variant="ghost" size="sm" disabled={off} onClick={() => view?.serviceManager?.getEventBus?.()?.emit('lighting-reset-explored')}>
            <RotateCcw />
            {t('sceneLight.forgetExplored')}
          </Button>
        </div>
      </div>
    </div>
  );
}
