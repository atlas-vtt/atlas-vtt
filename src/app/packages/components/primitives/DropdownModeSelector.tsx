import React from "react"
import { Button } from "./button"

export interface ModeSelectorOption<T extends string> {
  value: T
  icon: React.ComponentType<{ className?: string }>
  label: string
}

export interface DropdownModeSelectorProps<T extends string> {
  label?: string
  value: T
  options: ModeSelectorOption<T>[]
  onChange: (value: T) => void
}

export function DropdownModeSelector<T extends string>({
  label,
  value,
  options,
  onChange,
}: DropdownModeSelectorProps<T>): React.ReactElement {
  return (
    <div className="atlas-dropdown-stack">
      {label && <span className="atlas-dropdown-label">{label}</span>}
      <div className="flex gap-1.5">
        {options.map(({ value: optionValue, icon: Icon, label: optionLabel }) => (
          <Button
            key={optionValue}
            variant="ghost"
            size="sm"
            className={`flex-1 flex items-center justify-center gap-1 ${
              value === optionValue ? 'atlas-dropdown-mode-btn--active' : ''
            }`}
            onClick={() => onChange(optionValue)}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="text-xs">{optionLabel}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
