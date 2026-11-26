import React from "react"
import { Check } from "lucide-react"
import { LabelTooltip } from "./tooltip"

export interface DropdownSwatch {
  value: string
  label: string
}

interface DropdownSwatchGridProps {
  label: string
  /** The label only names the group: where the swatches say what they are, it is not shown. */
  labelHidden?: boolean
  swatches: readonly DropdownSwatch[]
  value: string
  onChange: (value: string) => void
  /** A line of guidance under the swatches. */
  hint?: string
  /** A last cell after the swatches, e.g. a picker for any other colour. */
  children?: React.ReactNode
  /** The swatches are all their menu holds, so the ones in its corners take the menu's curve. */
  fillsMenu?: boolean
}

/** A row of colour swatches under its label for toolbar dropdowns and popovers; the current colour is ringed. */
export function DropdownSwatchGrid({ label, labelHidden = false, swatches, value, onChange, hint, children, fillsMenu = false }: DropdownSwatchGridProps): React.ReactElement {
  const current = value.toLowerCase()
  const labelId = React.useId()
  return (
    <div className="atlas-dropdown-swatches" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="atlas-dropdown-swatches__label" hidden={labelHidden}>{label}</span>
      <div className={`atlas-swatch-grid${fillsMenu ? " atlas-swatch-grid--fills-menu" : ""}`}>
        {swatches.map((swatch) => {
          const isActive = current === swatch.value.toLowerCase()
          return (
            <LabelTooltip key={swatch.value} label={swatch.label}>
              <button
                type="button"
                aria-label={swatch.label}
                aria-pressed={isActive}
                className={`atlas-swatch${isActive ? " atlas-swatch--active" : ""}`}
                style={{ backgroundColor: swatch.value }}
                onClick={() => onChange(swatch.value)}
              >
                {isActive && <Check className="atlas-swatch-check" aria-hidden="true" />}
              </button>
            </LabelTooltip>
          )
        })}
        {children}
      </div>
      {hint && <span className="atlas-dropdown-swatches__hint">{hint}</span>}
    </div>
  )
}
