import React, { forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { cn } from "src/utils/cn"
import { observeResize } from "../../../utils/observeResize"
import { isToolbarControlId } from "../../../toolbar/toolbarCatalog"
import { useToolbarEdit } from "./editor/toolbarEditContext"
import { ToolbarEditOverflowMenu } from "./editor/ToolbarEditOverflowMenu"
import { ToolbarItemHandle } from "./editor/ToolbarItemHandle"
import { stopMapShortcuts } from "./editor/useToolbarKeyboard"
import { overflowingToolbarItems } from "./toolbarFit"
import { measureBar, sameGeometry, type BarGeometry } from "./toolbarGeometry"
import { ToolbarOverflowMenu } from "./ToolbarOverflowMenu"
import { ToolbarSpaceContext } from "./toolbarSpace"
import { useControlPlacements } from "./useControlPlacements"
import type { ResponsiveToolbarItem } from "./toolbarTypes"

interface ResponsiveToolbarProps {
  items: readonly ResponsiveToolbarItem[]
  /** Controls the user hid: never in the bar or in "More tools", except while visiting. */
  hiddenIds?: ReadonlySet<string>
  /**
   * The toolbar editor is open: the bar shows exactly the stored layout, so
   * hidden controls do not visit, and with the editor's context each control
   * is inert under a handle the editor works through.
   */
  editing?: boolean
  /** A control that always stays at the very end of the bar, after the overflow button. */
  end?: React.ReactNode
}

const NO_CONTROLS: ReadonlySet<string> = new Set()

/**
 * The main toolbar's bar. When its row has less room than all controls need,
 * controls move into a "More tools" menu at the end of the bar, from the
 * right; the rest keep their order. Pinned controls (the tool in use, a
 * control whose menu or panel is open, the Command palette) always stay, and
 * so does the `end` control, which keeps the bar's last place. A control the
 * user hid shows only while it visits the bar (see `nextVisitArmed`), at its
 * place in the order and pinned. Every control stays mounted while it is in
 * the menu or hidden, so tool options keep their state and the bar can
 * measure it again once it returns.
 */
export const ResponsiveToolbar = forwardRef<HTMLDivElement, ResponsiveToolbarProps>(({ items, hiddenIds, editing = false, end }, forwardedRef) => {
  const space = useContext(ToolbarSpaceContext)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [geometry, setGeometry] = useState<BarGeometry | null>(null)
  const placements = useControlPlacements(items, hiddenIds, editing)
  const edit = useToolbarEdit()
  const withHandles = editing && edit !== null
  const labelId = useId()

  const setBar = useCallback((element: HTMLDivElement | null): void => {
    barRef.current = element
    if (typeof forwardedRef === "function") forwardedRef(element)
    else if (forwardedRef) forwardedRef.current = element
  }, [forwardedRef])

  const measure = useCallback((): void => {
    const bar = barRef.current
    if (!bar) return
    setGeometry((previous) => {
      const next = measureBar(bar, previous)
      return sameGeometry(previous, next) ? previous : next
    })
  }, [])

  // Before paint after every render: an item may have appeared or changed width.
  useLayoutEffect(measure)

  // Style changes that never re-render (theme, zoom) reach the bar's size.
  useEffect(() => {
    const bar = barRef.current
    return bar ? observeResize([bar], measure) : undefined
  }, [measure])

  const shown = items.filter((item) => placements.get(item.id) !== "hidden")
  const overflowing = space === null || !geometry ? NO_CONTROLS : overflowingToolbarItems(
    shown.map(({ id, pinned }) => ({ id, pinned: pinned || placements.get(id) === "visiting", width: geometry.widths[id] })),
    { available: space, chrome: geometry.chrome, gap: geometry.gap, overflowButtonWidth: geometry.overflowButtonWidth },
  )
  const overflowItems = shown.filter((item) => overflowing.has(item.id))
  const inBar = shown.filter((item) => !overflowing.has(item.id)).map((item) => item.id)
  const tabStop = edit?.current.bar && inBar.includes(edit.current.bar) ? edit.current.bar : inBar[0]

  return (
    <div
      ref={setBar}
      className={cn("atlas-vtt-toolbar atlas-main-toolbar", withHandles && "is-editing")}
      {...(withHandles && { role: "toolbar", "aria-labelledby": labelId, onKeyDown: stopMapShortcuts })}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="atlas-toolbar-item"
          data-toolbar-item={item.id}
          hidden={placements.get(item.id) === "hidden" || overflowing.has(item.id)}
        >
          {withHandles && isToolbarControlId(item.id) && (
            <ToolbarItemHandle id={item.id} group="bar" tabIndex={item.id === tabStop ? 0 : -1} />
          )}
          {/* Always this wrapper, so a control is never remounted when edit mode starts or ends. */}
          <div className="atlas-toolbar-item__content" inert={withHandles}>{item.element}</div>
        </div>
      ))}
      {overflowItems.length > 0 && (withHandles ? <ToolbarEditOverflowMenu items={overflowItems} /> : <ToolbarOverflowMenu items={overflowItems} />)}
      {end && <div className="atlas-toolbar-end">{end}</div>}
      {withHandles && <span id={labelId} hidden>Toolbar</span>}
    </div>
  )
})

ResponsiveToolbar.displayName = "ResponsiveToolbar"
