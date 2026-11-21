import React from "react"
import { Button } from "./button"
import { Tooltip, TooltipTrigger, TooltipContent } from "./tooltip"
import { cn } from "../../../../utils/cn"
import { ChevronDown } from "lucide-react"
import { t } from "../../../i18n"

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
  /** Set for one of a set of choices (a mode): whether it is the one chosen, for screen readers. */
  pressed?: boolean
  /** Where the tooltip opens; above unless the bar is upright, whose buttons it would cover. */
  tooltipSide?: "top" | "left" | "right" | "bottom"
  /** One word under the icon, where no tooltip can say what the button does (a finger): the button then has no tooltip. */
  caption?: string
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
  pressed,
  tooltipSide = "top",
  caption,
  // dropdown props
  showChevron = false,
  onChevronClick,
  chevronRef,
  isDropdownOpen = false,
  dropdownContent,
}): React.ReactElement => {
  const button = (
    <span style={{ display: 'inline-flex' }}>
      <Button
        variant="toolbar"
        size="icon"
        onClick={disabled ? undefined : onClick}
        aria-disabled={disabled || undefined}
        {...(menuExpanded !== undefined && { "aria-haspopup": "menu" as const, "aria-expanded": menuExpanded })}
        {...(pressed !== undefined && { "aria-pressed": pressed })}
        className={cn(
          "btn--toolbar",
          isActive && "is-active",
          disabled && "atlas-tool-button--disabled",
          caption !== undefined && "atlas-tool-button--captioned",
          className,
        )}
      >
        <Icon />
        {caption !== undefined && <span className="atlas-tool-button__caption" aria-hidden="true">{caption}</span>}
        <span className="sr-only">{label}</span>
      </Button>
    </span>
  )
  return (
    <div className="atlas-tool-button">
      {caption !== undefined ? button : (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side={tooltipSide} sideOffset={10}>
            <div>
              <div className="tooltip-inner">
                <span className="tooltip-label">{label}</span>
                {shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
              </div>
              {subtitle && <span className="tooltip-subtitle">{subtitle}</span>}
            </div>
          </TooltipContent>
        </Tooltip>
      )}

      {showChevron && (
        <Button
          variant="toolbar"
          size="sm"
          ref={chevronRef}
          className="atlas-tool-button-chevron"
          onClick={onChevronClick}
        >
          <ChevronDown />
          <span className="sr-only">{t('toolbar.optionsOf', { label })}</span>
        </Button>
      )}

      {showChevron && isDropdownOpen && dropdownContent}
    </div>
  )
}

export default ToolButton
