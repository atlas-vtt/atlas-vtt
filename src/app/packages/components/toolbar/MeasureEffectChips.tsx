import React, { useId } from "react"
import { Ban, CloudFog, Flame, Moon, Snowflake, Sun, Zap, type LucideIcon } from "lucide-react"
import { t } from "../../../i18n"
import { MEASURE_EFFECTS, type MeasureEffect } from "../../../measure/measureEffects"
import { lightMarkerTheme, readableTint } from "../../../pixi/lighting/lightMarker"
import { cssColorToHexNumber, hexColorOf } from "../../../pixi/utils/colorUtils"
import { LabelTooltip } from "../primitives/tooltip"

/** The glyph of each look. */
export const MEASURE_EFFECT_ICONS: Readonly<Record<MeasureEffect, LucideIcon>> = { fire: Flame, frost: Snowflake, lightning: Zap, mist: CloudFog, radiance: Sun, shadow: Moon }

const NAMES: Readonly<Record<MeasureEffect, string>> = {
  fire: t('measure.effect.fire'),
  frost: t('measure.effect.frost'),
  lightning: t('measure.effect.lightning'),
  mist: t('measure.effect.mist'),
  radiance: t('measure.effect.radiance'),
  shadow: t('measure.effect.shadow'),
}

const CHOICES: readonly (MeasureEffect | null)[] = [null, ...MEASURE_EFFECTS]

interface MeasureEffectChipsProps {
  value: MeasureEffect | null
  onChange: (effect: MeasureEffect | null) => void
  /** '#rrggbb' of the area the look is for; null is the theme's accent. */
  color: string | null
  /** Shows the row's name above it, as a menu's rows of swatches have theirs; unset, it only names the group. */
  labelled?: boolean
}

/**
 * The looks an area can take, as one row of chips like a light's kinds: none first, then the six.
 * The chosen one is ringed and shows its glyph in the area's colour, on the badge the map's markers have.
 */
export function MeasureEffectChips({ value, onChange, color, labelled = false }: MeasureEffectChipsProps): React.ReactElement {
  const labelId = useId()
  const theme = lightMarkerTheme()
  const tint = readableTint(color === null ? theme.accent : cssColorToHexNumber(color), theme.background)
  const style = { '--atlas-light-badge': hexColorOf(theme.background), '--atlas-light-tint': hexColorOf(tint) } as React.CSSProperties
  const chips = (
    <div className="atlas-light-popover__kinds" role="group" aria-labelledby={labelId} style={style}>
      {!labelled && <span id={labelId} hidden>{t('measure.effect')}</span>}
      {CHOICES.map((effect) => {
        const Icon = effect ? MEASURE_EFFECT_ICONS[effect] : Ban
        const name = effect ? NAMES[effect] : t('measure.effect.none')
        return (
          <LabelTooltip key={effect ?? 'none'} label={name}>
            <button type="button" className="atlas-light-kind" aria-label={name} aria-pressed={effect === value} onClick={() => onChange(effect)}>
              <Icon className="atlas-light-glyph" aria-hidden="true" />
            </button>
          </LabelTooltip>
        )
      })}
    </div>
  )
  if (!labelled) return chips
  return (
    <div className="atlas-dropdown-swatches">
      <span id={labelId} className="atlas-dropdown-swatches__label">{t('measure.effect')}</span>
      {chips}
    </div>
  )
}
