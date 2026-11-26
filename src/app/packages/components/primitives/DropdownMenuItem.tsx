import React, { FC } from "react"
import { Check } from "lucide-react"
import { Button } from "./button"

export interface DropdownMenuItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  isActive?: boolean
  destructive?: boolean
  /**
   * The row begins with its icon, on the menu's text edge: for a menu none of whose rows is
   * ticked, where the place kept for a tick would only set the row in from every other.
   */
  flush?: boolean
  /** Shown, but not to be chosen right now. */
  disabled?: boolean
  /** Set inside a `role="menu"` container, which arrow keys move through. */
  role?: "menuitem"
  onClick: () => void
}

export const DropdownMenuItem: FC<DropdownMenuItemProps> = ({
  icon: Icon,
  label,
  shortcut,
  isActive = false,
  destructive = false,
  flush = false,
  disabled = false,
  role,
  onClick,
}) => {
  if (destructive && !flush) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="atlas-dropdown-btn--destructive w-full flex items-center justify-center gap-2"
        disabled={disabled}
        onClick={onClick}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`atlas-dropdown-menu-item${flush ? ' atlas-dropdown-menu-item--flush' : ''}${destructive ? ' atlas-dropdown-btn--destructive' : ''}`}
      role={role}
      disabled={disabled}
      onClick={onClick}
    >
      {!flush && (
        <span className="atlas-dropdown-menu-item__check">
          {isActive && <Check className="h-4 w-4" />}
        </span>
      )}
      <Icon className="h-4 w-4" />
      <span>{label}</span>
      {shortcut && <span className="atlas-dropdown-menu-item__shortcut">{shortcut}</span>}
    </Button>
  )
}
