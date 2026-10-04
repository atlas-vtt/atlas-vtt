import type React from "react"
import type { ToolbarItemBody } from "./toolbarItems"

/** How a control that moved into the toolbar's overflow menu shows there. */
export interface ToolbarMenuEntry {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  /** Shows the check mark: the tool in use, or a view option that is on. */
  isActive: boolean
  onSelect: () => void
}

/** One control of the main toolbar. */
export type ResponsiveToolbarItem = ToolbarItemBody & { id: string }
