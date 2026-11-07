import React, { FC, useId } from "react"
import { Slider } from "./slider"

export interface DropdownSliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  /** Shown, but not to be set: its value means nothing right now. */
  disabled?: boolean
  onChange: (value: number) => void
}

/** A menu row with a slider: its name and value on the menu's text edge, the track across the menu. A screen reader hears the value as it is shown, with its unit. */
export const DropdownSliderRow: FC<DropdownSliderRowProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  disabled = false,
  onChange,
}) => {
  const labelId = useId()
  return (
    <div className={`atlas-dropdown-slider-row${disabled ? ' atlas-dropdown-slider-row--disabled' : ''}`}>
      <div className="atlas-dropdown-slider-row__head">
        <span id={labelId} className="atlas-dropdown-label">{label}</span>
        <span className="atlas-dropdown-slider-row__value">{value}{unit}</span>
      </div>
      <Slider
        aria-labelledby={labelId}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        getValueText={(v: number) => `${v}${unit}`}
        onValueChange={(v: number[]) => onChange(v[0] ?? value)}
      />
    </div>
  )
}
