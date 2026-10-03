import React from "react"
import { ToolButton } from "../primitives/ToolButton"
import type { ToolFace } from "./toolFaces"
import type { ToolbarContext, ToolMenu } from "./toolbarContext"
import type { ToolbarMenuEntry } from "./toolbarTypes"

/** A control's part of a toolbar item; the registry adds its id. */
export interface ToolbarItemBody {
  /** Split button (tool and chevron) or a single button. */
  kind: 'group' | 'button'
  /**
   * Keeps the control in the bar, never in "More tools": the tool in use, a
   * control whose menu or panel hangs from it, and the Command palette.
   */
  pinned: boolean
  /** The control's tool is in use or its menu or panel is open: what lets a hidden control visit the bar. */
  active: boolean
  element: React.ReactNode
  menuEntry: ToolbarMenuEntry
}

/** A tool group: pinned and active while its tool is in use or its options are open. */
export function toolGroupItem(ctx: ToolbarContext, menu: ToolMenu, face: ToolFace, element: React.ReactNode): ToolbarItemBody {
  const inUse = face.isActive || ctx.openMenu === menu
  return {
    kind: 'group',
    pinned: inUse,
    active: inUse,
    element,
    menuEntry: { icon: face.icon, label: face.label, shortcut: ctx.hotkeyLabel(menu), isActive: face.isActive, onSelect: () => ctx.selectTool(face.tool) },
  }
}

interface ButtonItemOptions {
  icon: ToolFace["icon"]
  label: string
  shortcut: string
  isActive: boolean
  onClick: () => void
  /** Tools pin while in use; panels that float on their own do not. */
  pinned: boolean
}

/** A plain button for a tool or a panel; active while its tool is in use or its panel is open. */
export function buttonItem({ pinned, ...button }: ButtonItemOptions): ToolbarItemBody {
  return {
    kind: 'button',
    pinned,
    active: button.isActive,
    element: <ToolButton {...button} />,
    menuEntry: { icon: button.icon, label: button.label, shortcut: button.shortcut, isActive: button.isActive, onSelect: button.onClick },
  }
}
