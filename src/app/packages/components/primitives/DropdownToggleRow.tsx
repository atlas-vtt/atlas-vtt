import React, { FC, useId } from "react"
import { cn } from "../../../../utils/cn"
import { ToggleSwitch } from "./Toggle"
import { LabelTooltip } from "./tooltip"

export interface DropdownToggleRowProps {
  label: string
  value: boolean
  onChange: () => void
  /** Shown but not switchable; `disabledReason` then says why in a tooltip on the switch. */
  disabled?: boolean | undefined
  disabledReason?: string | undefined
}

/** A menu row with a switch, which the row's text names. */
export const DropdownToggleRow: FC<DropdownToggleRowProps> = ({ label, value, onChange, disabled = false, disabledReason }) => {
  const labelId = useId()
  const toggle = <ToggleSwitch value={value} onChange={onChange} labelledBy={labelId} disabled={disabled} />
  return (
    <div className={cn("atlas-dropdown-toggle-row", disabled && "atlas-dropdown-toggle-row--disabled")}>
      <span id={labelId} className="atlas-dropdown-toggle-row__label">{label}</span>
      {disabled && disabledReason ? <LabelTooltip label={disabledReason} describe>{toggle}</LabelTooltip> : toggle}
    </div>
  )
}
