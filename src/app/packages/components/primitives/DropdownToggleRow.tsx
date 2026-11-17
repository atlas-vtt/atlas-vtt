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
  /** A tooltip on the switch while it can be switched: what it does and its key, placed by `LabelTooltip`'s `outside`. */
  tooltip?: { label: string; shortcut?: string; outside?: string } | undefined
}

/** A menu row with a switch, which the row's text names. */
export const DropdownToggleRow: FC<DropdownToggleRowProps> = ({ label, value, onChange, disabled = false, disabledReason, tooltip }) => {
  const labelId = useId()
  let toggle = <ToggleSwitch value={value} onChange={onChange} labelledBy={labelId} disabled={disabled} />
  if (disabled && disabledReason) {
    toggle = <LabelTooltip label={disabledReason} describe>{toggle}</LabelTooltip>
  } else if (tooltip && !disabled) {
    toggle = (
      <LabelTooltip label={tooltip.label} describe side="right" {...(tooltip.shortcut && { shortcut: tooltip.shortcut })} {...(tooltip.outside && { outside: tooltip.outside, sideOffset: 8 })}>
        {toggle}
      </LabelTooltip>
    )
  }
  return (
    <div className={cn("atlas-dropdown-toggle-row", disabled && "atlas-dropdown-toggle-row--disabled")}>
      <span id={labelId} className="atlas-dropdown-toggle-row__label">{label}</span>
      {toggle}
    </div>
  )
}
