import { t } from '../../../i18n';
import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Ellipsis } from "lucide-react"
import { cn } from "src/utils/cn"
import { ToolButton } from "../primitives/ToolButton"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { useKeepInView } from "../primitives/useKeepInView"
import type { ResponsiveToolbarItem } from "./toolbarTypes"

const MENU_LABEL = t('toolbar.moreTools')

interface ToolbarOverflowMenuProps {
  /** The controls that did not fit into the bar, in bar order. */
  items: readonly ResponsiveToolbarItem[]
  /** The toolbar editor is open: choosing or right-clicking a row asks `onEditEntry` instead of running the control. */
  editing?: boolean
  /** Opens the editor's menu for a control, at a point in client coordinates; `trigger` is the "More tools" button. */
  onEditEntry?: (id: string, at: { x: number; y: number }, trigger: HTMLButtonElement | null) => void
  /** A tool dragged in the editor would land here: the bar has no room for it. */
  dropTarget?: boolean
}

/** Where a menu for a row opens from the keyboard or a click: its bottom-left corner. */
function rowCorner(row: Element | undefined): { x: number; y: number } {
  const rect = row?.getBoundingClientRect()
  return { x: rect?.left ?? 0, y: rect?.bottom ?? 0 }
}

/** Index of the menu item an arrow key moves to, or null for other keys. */
function nextMenuIndex(key: string, current: number, count: number): number | null {
  switch (key) {
    case "ArrowDown": return (current + 1) % count
    case "ArrowUp": return current <= 0 ? count - 1 : current - 1
    case "Home": return 0
    case "End": return count - 1
    default: return null
  }
}

/**
 * The toolbar's last button: a menu with the controls that did not fit into
 * the bar. Choosing a tool here makes it the active tool, which brings it back
 * into the bar with its options. Opened from the keyboard, the menu focuses
 * its first item; arrow keys move through it and Escape returns to the button.
 * While the toolbar editor is open, a row opens the editor's menu instead.
 */
export function ToolbarOverflowMenu({ items, editing = false, onEditEntry, dropTarget = false }: ToolbarOverflowMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const openedFromKeyboard = useRef(false)
  const keepInView = useKeepInView(menuRef, open, "top")

  const trigger = (): HTMLButtonElement | null => rootRef.current?.querySelector("button") ?? null
  const menuItems = (): HTMLButtonElement[] => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

  const close = (restoreFocus: boolean): void => {
    setOpen(false)
    if (restoreFocus) trigger()?.focus()
  }

  // A press anywhere else (touch included) or Escape closes the menu.
  useEffect(() => {
    const root = rootRef.current
    if (!open || !root) return undefined
    const doc = root.doc
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.contains(event.target as Node)) setOpen(false)
    }
    // Before anyone listening in the bubble phase (the toolbar editor, the map), which then leave this Escape alone.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setOpen(false)
      if (openedFromKeyboard.current) trigger()?.focus()
    }
    doc.addEventListener("pointerdown", onPointerDown, true)
    doc.addEventListener("keydown", onKeyDown, true)
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown, true)
      doc.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (open && openedFromKeyboard.current) menuItems()[0]?.focus()
  }, [open])

  const toggle = (): void => {
    openedFromKeyboard.current = trigger()?.matches(":focus-visible") ?? false
    setOpen((wasOpen) => !wasOpen)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Tab") {
      setOpen(false)
      return
    }
    const buttons = menuItems()
    const next = nextMenuIndex(event.key, buttons.indexOf(event.target as HTMLButtonElement), buttons.length)
    if (next === null || buttons.length === 0) return
    // Arrow keys also drive map shortcuts (initiative turns); the menu has them first.
    event.preventDefault()
    event.stopPropagation()
    buttons[next]?.focus()
  }

  const editEntry = (index: number, at: { x: number; y: number }): void => {
    const item = items[index]
    if (!item || !onEditEntry) return
    close(false)
    onEditEntry(item.id, at, trigger())
  }

  const onMenuContextMenu = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (!editing) return
    event.preventDefault()
    const row = (event.target as Element).closest('[role="menuitem"]')
    editEntry(menuItems().findIndex((button) => button === row), { x: event.clientX, y: event.clientY })
  }

  return (
    <div ref={rootRef} className="atlas-toolbar-overflow" {...(dropTarget && { "data-drop-target": "true" })}>
      <ToolButton icon={Ellipsis} label={MENU_LABEL} isActive={false} menuExpanded={open} onClick={toggle} />
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={MENU_LABEL}
          className={cn(
            "atlas-dropdown-content atlas-dropdown-content--top atlas-dropdown-content--right",
            keepInView.capped && "atlas-keep-in-view--capped",
          )}
          style={keepInView.style}
          onKeyDown={onMenuKeyDown}
          onContextMenu={onMenuContextMenu}
        >
          <div className="atlas-dropdown-section">
            {items.map(({ id, menuEntry }, index) => (
              <DropdownMenuItem
                key={id}
                role="menuitem"
                icon={menuEntry.icon}
                label={menuEntry.label}
                {...(menuEntry.shortcut !== undefined && { shortcut: menuEntry.shortcut })}
                isActive={menuEntry.isActive}
                onClick={() => {
                  if (editing) {
                    editEntry(index, rowCorner(menuItems()[index]))
                    return
                  }
                  close(openedFromKeyboard.current)
                  menuEntry.onSelect()
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
