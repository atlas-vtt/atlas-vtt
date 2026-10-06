import React, { FC } from "react"
import { Check, X } from "lucide-react"
import { cn } from "../../../../utils/cn"
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip"

type ToggleIcon = React.ComponentType<React.SVGProps<SVGSVGElement>>

export interface ToggleSwitchProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Current toggle state (on=true, off=false) */
  value: boolean
  /** Callback when user toggles */
  onChange: () => void
  /** Icon to show when value is true */
  iconOn?: ToggleIcon
  /** Icon to show when value is false */
  iconOff?: ToggleIcon
  /** Id of the visible label that names the switch. */
  labelledBy?: string
}

/**
 * The switch itself: a `role="switch"` that a click, Enter and Space toggle. Name it with
 * `labelledBy`; `Toggle` adds a tooltip saying what each state does.
 */
export const ToggleSwitch = React.forwardRef<HTMLDivElement, ToggleSwitchProps>(({
  value,
  onChange,
  iconOn: IconOn = Check,
  iconOff: IconOff = X,
  labelledBy,
  className,
  onClick,
  onKeyDown,
  ...rest
}, ref) => {
  const state = value ? "on" : "off"
  const Icon = value ? IconOn : IconOff
  return (
    <div
      {...rest}
      ref={ref}
      className={cn("atlas-toggle", className)}
      role="switch"
      aria-checked={value}
      aria-labelledby={labelledBy}
      tabIndex={0}
      onClick={(event) => {
        onClick?.(event)
        onChange()
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        onChange()
      }}
    >
      <div className={`atlas-toggle__switch atlas-toggle__switch--${state}`}>
        <div className={`atlas-toggle__thumb atlas-toggle__thumb--${state}`}>
          <Icon className="atlas-toggle__icon" />
        </div>
      </div>
    </div>
  )
})
ToggleSwitch.displayName = "ToggleSwitch"

export interface ToggleProps extends Pick<ToggleSwitchProps, "value" | "onChange" | "iconOn" | "iconOff" | "labelledBy"> {
  /** Tooltip text when toggle is true */
  tooltipOn: string
  /** Tooltip text when toggle is false */
  tooltipOff: string
  /** Optional wrapper className */
  className?: string
}

/** A `ToggleSwitch` with a tooltip for each state. */
export const Toggle: FC<ToggleProps> = ({ tooltipOn, tooltipOff, ...toggle }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <ToggleSwitch {...toggle} />
    </TooltipTrigger>
    <TooltipContent
      side="top"
      sideOffset={10}
      className="border-[var(--background-modifier-border)] bg-[var(--background-secondary)] text-[var(--text-normal)]"
    >
      <p>{toggle.value ? tooltipOn : tooltipOff}</p>
    </TooltipContent>
  </Tooltip>
)
