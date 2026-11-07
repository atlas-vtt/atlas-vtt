import React, { Fragment, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { cn } from "src/utils/cn"
import { t } from "../../../i18n"
import { observeResize } from "../../../utils/observeResize"
import { isToolbarControlId, UNDO_BAR_ID } from "../../../toolbar/toolbarCatalog"
import { CARRY, GAP } from "./editor/editorMotion"
import { useToolbarEdit } from "./editor/toolbarEditContext"
import { ToolbarEditOverflowMenu } from "./editor/ToolbarEditOverflowMenu"
import { ToolbarItemHandle } from "./editor/ToolbarItemHandle"
import { useToolbarEditStore } from "./editor/toolbarEditStore"
import { ToolbarWell } from "./editor/ToolbarWell"
import { useBarDragView } from "./editor/useBarDragView"
import { stopMapShortcuts } from "./editor/useToolbarKeyboard"
import { overflowingToolbarItems, type ToolbarFitItem } from "./toolbarFit"
import { measureBar, sameGeometry, type BarGeometry } from "./toolbarGeometry"
import { ToolbarOverflowMenu } from "./ToolbarOverflowMenu"
import { ToolbarSpaceContext } from "./toolbarSpace"
import { ToolbarSlot } from "./ToolbarSlot"
import { useControlPlacements } from "./useControlPlacements"
import { RESTING_MOTION, slotChange, type ToolbarMotion } from "./useLayoutMotion"
import { useChangedSinceCommit } from "./useSlotPresence"
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
  /** The stored layout's changes: slots glide, open and close only for these and while a tool flies. */
  motion?: ToolbarMotion
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
 * measure it again once it returns. When the stored layout changes, controls
 * glide to their new places and open or close their width (`ToolbarSlot`); a
 * window resize and a visit change the bar at once. While a tool is dragged
 * in the toolbar editor, the bar previews the drop (`useBarDragView`): a well
 * opens where the tool would land, and the fit runs on that order.
 */
export const ResponsiveToolbar = forwardRef<HTMLDivElement, ResponsiveToolbarProps>(({ items, hiddenIds, editing = false, end, motion = RESTING_MOTION }, forwardedRef) => {
  const space = useContext(ToolbarSpaceContext)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [geometry, setGeometry] = useState<BarGeometry | null>(null)
  const placements = useControlPlacements(items, hiddenIds, editing)
  const edit = useToolbarEdit()
  const withHandles = editing && edit !== null
  const labelId = useId()
  const editStore = useToolbarEditStore()

  const setBar = useCallback((element: HTMLDivElement | null): void => {
    barRef.current = element
    if (typeof forwardedRef === "function") forwardedRef(element)
    else if (forwardedRef) forwardedRef.current = element
  }, [forwardedRef])

  const measure = useCallback((): void => {
    const bar = barRef.current
    // A drag or a settle changes the bar's size on purpose; measuring it would feed back into the fit.
    const { drag, settle } = editStore.state.getState()
    if (!bar || drag || settle) return
    setGeometry((previous) => {
      const next = measureBar(bar, previous)
      return sameGeometry(previous, next) ? previous : next
    })
  }, [editStore])

  // Before paint after every render: an item may have appeared or changed width.
  useLayoutEffect(measure)

  // Style changes that never re-render (theme, zoom) reach the bar's size.
  useEffect(() => {
    const bar = barRef.current
    return bar ? observeResize([bar], measure) : undefined
  }, [measure])

  const shown = items.filter((item) => placements.get(item.id) !== "hidden")
  const fit = (fitItems: readonly ToolbarFitItem[]): ReadonlySet<string> => space === null || !geometry ? NO_CONTROLS : overflowingToolbarItems(
    fitItems,
    { available: space, chrome: geometry.chrome, gap: geometry.gap, overflowButtonWidth: geometry.overflowButtonWidth },
  )
  const dragView = useBarDragView(
    shown.map(({ id, pinned }) => ({ id, pinned: pinned || placements.get(id) === "visiting", width: geometry?.widths[id] })),
    fit,
    barRef,
    setGeometry,
  )
  const { overflowing } = dragView
  const inBar = (item: ResponsiveToolbarItem): boolean => dragView.inFit.has(item.id) && !overflowing.has(item.id)
  const overflowItems = shown.filter((item) => overflowing.has(item.id))
  const barIds = shown.filter(inBar).map((item) => item.id)
  // The undo/redo bar's handle, first of the bar's group, holds its Tab stop once it had focus last.
  const undoHolds = edit?.current.bar === UNDO_BAR_ID && !edit.trayIds.includes(UNDO_BAR_ID)
  const tabStop = undoHolds ? null : edit?.current.bar && barIds.includes(edit.current.bar) ? edit.current.bar : barIds[0]
  // Controls come and go with a change of the layout, and overflow follows a flight or a drag; a window resize is instant.
  const flight = edit?.flight ?? null
  const animateChanges = useChangedSinceCommit(motion.revision) || flight !== null || dragView.active
  const layoutTransition = motion.cause === "move" ? CARRY : GAP

  const wellsAfter = (after: string | null): React.ReactNode => dragView.wells.filter((well) => well.after === after).map((well) => (
    <ToolbarWell key={well.key} width={dragView.wellWidth} closing={well.closing} onClosed={() => dragView.closeWell(well.key)} />
  ))

  return (
    <div
      ref={setBar}
      className={cn("atlas-vtt-toolbar atlas-main-toolbar", withHandles && "is-editing")}
      {...(withHandles && { role: "toolbar", "aria-labelledby": labelId, onKeyDown: stopMapShortcuts })}
    >
      {wellsAfter(null)}
      {items.map((item) => {
        const slot = dragView.slot(item.id)
        return (
          <Fragment key={item.id}>
            <ToolbarSlot
              item={item}
              shown={placements.get(item.id) !== "hidden" && inBar(item)}
              change={slotChange(motion, item.id, animateChanges && !slot.instant)}
              revision={motion.revision}
              layoutTransition={layoutTransition}
              drag={{ ...slot, settling: slot.settling || (flight?.travel === true && flight.id === item.id) }}
              inert={withHandles}
              handle={withHandles && isToolbarControlId(item.id) && (
                <ToolbarItemHandle id={item.id} group="bar" tabIndex={item.id === tabStop ? 0 : -1} />
              )}
              onSettle={measure}
            />
            {wellsAfter(item.id)}
          </Fragment>
        )
      })}
      {(overflowItems.length > 0 || dragView.dropTarget) && (withHandles
        ? <ToolbarEditOverflowMenu items={overflowItems} dropTarget={dragView.dropTarget} />
        : <ToolbarOverflowMenu items={overflowItems} />)}
      {end && <div className="atlas-toolbar-end">{end}</div>}
      {withHandles && <span id={labelId} hidden>{t('toolbarEdit.toolbar')}</span>}
    </div>
  )
})

ResponsiveToolbar.displayName = "ResponsiveToolbar"
