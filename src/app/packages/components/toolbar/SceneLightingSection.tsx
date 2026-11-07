import React from "react"
import { Eye, RotateCcw, SlidersHorizontal } from "lucide-react"
import { DEFAULT_AMBIENT_COLOR } from "../../../lighting/sceneLightingOptions"
import { TIMES_OF_DAY, type TimeOfDay } from "../../../lighting/timesOfDay"
import type { SceneLighting } from "../../../types/lightingTypes"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { SegmentedControl } from "../primitives/SegmentedControl"
import { LabelTooltip } from "../primitives/tooltip"
import { t } from '../../../i18n';


interface SceneLightingSectionProps {
  lighting: SceneLighting
  onChange: (changes: Partial<SceneLighting>) => void
  onResetExplored: () => void
  /** Marks the whole map as explored; offered while the tool edits the explored memory. */
  onRevealExplored?: () => void
  /** Opens the panel with the scene's other lighting options. */
  onOpenSettings: () => void
}

/**
 * Scene-wide lighting in the lighting tool's menu: a section with how dark the scene is, one
 * with its actions, and the switch last, at the menu's foot. The players' view of it is session
 * view, not shown here.
 * While lighting is off everything but the switch is shown disabled, so the menu keeps its
 * shape and the switch its place.
 */
export function SceneLightingSection({ lighting, onChange, onResetExplored, onRevealExplored, onOpenSettings }: SceneLightingSectionProps): React.ReactElement {
  const time = TIMES_OF_DAY.find((stop) => stop.ambient === lighting.ambient)?.value ?? 'custom'
  const disabled = !lighting.enabled
  return (
    <>
      <div className="atlas-dropdown-section atlas-scene-lighting">
        <SegmentedControl<TimeOfDay | 'custom'>
          value={time}
          options={TIMES_OF_DAY}
          ariaLabel={t('sceneLight.timeOfDay')}
          disabled={disabled}
          onChange={(value) => {
            const stop = TIMES_OF_DAY.find((candidate) => candidate.value === value)
            if (stop) onChange({ ambient: stop.ambient })
          }}
        />
        <div className="atlas-scene-lighting__ambient">
          <DropdownSliderRow
            label={t('sceneLight.ambient')}
            value={Math.round(lighting.ambient * 100)}
            min={0}
            max={100}
            unit="%"
            disabled={disabled}
            onChange={(percent) => onChange({ ambient: percent / 100 })}
          />
          <LabelTooltip label={t('sceneLight.ambientColour')}>
            <input
              type="color"
              className="atlas-swatch atlas-swatch--picker"
              value={lighting.ambientColor ?? DEFAULT_AMBIENT_COLOR}
              disabled={disabled}
              onChange={(event) => onChange({ ambientColor: event.target.value })}
            />
          </LabelTooltip>
        </div>
      </div>
      <div className="atlas-dropdown-section">
        {onRevealExplored && <DropdownMenuItem icon={Eye} label={t('sceneLight.revealAll')} disabled={disabled} onClick={onRevealExplored} />}
        <DropdownMenuItem icon={RotateCcw} label={t('sceneLight.forgetExplored')} disabled={disabled} onClick={onResetExplored} />
        <DropdownMenuItem icon={SlidersHorizontal} label={t('sceneLight.openSettings')} disabled={disabled} onClick={onOpenSettings} />
      </div>
      <div className="atlas-dropdown-section">
        <DropdownToggleRow label={t('sceneLight.dynamic')} value={lighting.enabled} onChange={() => onChange({ enabled: !lighting.enabled })} />
      </div>
    </>
  )
}
