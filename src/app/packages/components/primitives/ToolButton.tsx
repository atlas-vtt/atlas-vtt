import React from "react"
import { Button } from "./button"
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip"
import { cn } from "../../../../utils/cn"
import { ChevronDown } from "lucide-react"

interface ToolButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  subtitle?: string
  isActive: boolean
  onClick: () => void
  className?: string
  disabled?: boolean
  /** Set for a button that opens a menu: whether that menu is open. */
  menuExpanded?: boolean
  // Dropdown support
  showChevron?: boolean
  onChevronClick?: () => void
  chevronRef?: React.RefObject<HTMLButtonElement>
  isDropdownOpen?: boolean
  dropdownContent?: React.ReactNode
}

export const ToolButton: React.FC<ToolButtonProps> = ({
  icon: Icon,
  label,
  shortcut,
  subtitle,
  isActive,
  onClick,
  className,
  disabled = false,
  menuExpanded,
  // dropdown props
  showChevron = false,
  onChevronClick,
  chevronRef,
  isDropdownOpen = false,
  dropdownContent,
}): React.ReactElement => {
  return (
    <div className="atlas-tool-button">
      <Tooltip>
        <TooltipTrigger asChild>
          <span style={{ display: 'inline-flex' }}>
            <Button
              variant="toolbar"
              size="icon"
              onClick={disabled ? undefined : onClick}
              aria-disabled={disabled || undefined}
              {...(menuExpanded !== undefined && { "aria-haspopup": "menu" as const, "aria-expanded": menuExpanded })}
              className={cn(
                "btn--toolbar",
                isActive && "is-active",
                disabled && "atlas-tool-button--disabled",
                className,
              )}
            >
              <Icon />
              <span className="sr-only">{label}</span>
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={10}>
          <div>
            <div className="tooltip-inner">
              <span className="tooltip-label">{label}</span>
              {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
            </div>
            {subtitle && <span className="tooltip-subtitle">{subtitle}</span>}
          </div>
        </TooltipContent>
      </Tooltip>

      {showChevron && (
        <Button
          variant="toolbar"
          size="sm"
          ref={chevronRef}
          className="atlas-tool-button-chevron"
          onClick={onChevronClick}
        >
          <ChevronDown />
          <span className="sr-only">{label} Options</span>
        </Button>
      )}

      {showChevron && isDropdownOpen && dropdownContent}
    </div>
  )
}

export default ToolButton
