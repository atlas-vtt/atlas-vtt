import React, { FC, useId } from "react"
import { ToggleSwitch } from "./Toggle"

export interface DropdownToggleRowProps {
  label: string
  value: boolean
  onChange: () => void
  /** Shown disabled, in place: a switch that cannot be used keeps the menu's shape. */
  disabled?: boolean
  /** Said to screen readers with the switch, e.g. why it is disabled. Not drawn. */
  description?: string
}

/** A menu row with a switch, which the row's text names. */
export const DropdownToggleRow: FC<DropdownToggleRowProps> = ({ label, value, onChange, disabled = false, description }) => {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <div className="atlas-dropdown-toggle-row">
      <span id={labelId} className="atlas-dropdown-toggle-row__label">{label}</span>
      {description && <span id={descriptionId} className="atlas-dropdown-toggle-row__description">{description}</span>}
      <ToggleSwitch
        value={value}
        onChange={onChange}
        labelledBy={labelId}
        disabled={disabled}
        {...(description ? { 'aria-describedby': descriptionId } : {})}
      />
    </div>
  )
}
