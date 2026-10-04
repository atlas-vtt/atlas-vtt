import type React from 'react'
import { useCallback, useContext, useEffect, useLayoutEffect, useRef } from 'react'
import type { MapHotkeyId } from '../../../../keyboard/mapHotkeys'
import { useAtlasUI } from '../../../../react/root/AtlasUIContext'
import { useViewStoreHook } from '../../../../react/ViewStoreContext'
import { isHideableToolbarControl, toolbarControl, type ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { withControlAfter, withControlHidden, type ToolbarLayout } from '../../../../toolbar/toolbarLayout'
import { ToolbarSpaceContext } from '../toolbarSpace'
import type { ToolbarChangeCause } from '../useLayoutMotion'
import type { ResponsiveToolbarItem } from '../toolbarTypes'
import { cancelledMessage, hiddenMessage, movedMessage, refusedMessage, shownMessage } from './toolbarAnnouncements'
import { settledBar, shownBarIds, zonesOf } from './toolbarDragGeometry'
import { dropIndex, leftNeighbour, zoneAt, type FrozenZones } from './toolbarDropIndex'
import { editorRowOf, mainToolbarOf } from './toolbarEditDom'
import { IDLE_TOOLBAR_EDIT, type ToolbarEditStore, type ToolbarPlace } from './toolbarEditStore'
import { motionModeOf } from './editorMotion'
import { ToolbarPointerSession, type ClientPoint } from './toolbarPointerSession'

interface ToolbarDragOptions {
  store: ToolbarEditStore
  items: readonly ResponsiveToolbarItem[]
  /** The layout the bar shows: during a drag, the one it began with. */
  layout: ToolbarLayout
  available: ReadonlySet<ToolbarControlId>
  editing: boolean
  /** Stores what a drop changed, applied to the latest stored layout. */
  change: (cause: ToolbarChangeCause, update: (latest: ToolbarLayout) => ToolbarLayout) => void
  announce: (text: string) => void
  hotkeyLabel: (id: MapHotkeyId) => string
}

export interface ToolbarDragControls {
  /** A press on a handle, which may become a drag. */
  press: (event: React.PointerEvent<HTMLElement>, id: ToolbarControlId, from: ToolbarPlace) => void
  /** Asked before a context menu opens on a handle: never during a drag. */
  allowContextMenu: () => boolean
}

/** What a drag keeps from its pickup: the row it is drawn in and the zones frozen then. */
interface DragFrame {
  row: Element
  rowLeft: number
  rowTop: number
  zones: FrozenZones
  gap: number
}

function barPositions(layout: ToolbarLayout, available: ReadonlySet<ToolbarControlId>): ToolbarControlId[] {
  return layout.order.filter(id => available.has(id) && !layout.hidden.has(id))
}

/**
 * Dragging the toolbar editor's tools with the pointer: the press, the drag
 * past the threshold, the preview it drives (zone, the slot the well opens
 * in), and the drop or cancel. Each pointer move updates the edit store only
 * when the zone or the slot changes; the ghost follows the pointer through
 * motion values. A drop is stored at once, on the latest layout; the ghost
 * then settles onto the control. Ending edit mode, the control going away or
 * a window resize cancel a drag.
 */
export function useToolbarDrag(options: ToolbarDragOptions): ToolbarDragControls {
  const { store, editing, available } = options
  const { view } = useAtlasUI()
  const viewStore = useViewStoreHook()
  const space = useContext(ToolbarSpaceContext)
  const latest = useRef(options)
  const session = useRef<ToolbarPointerSession | null>(null)
  const frame = useRef<DragFrame | null>(null)
  const serial = useRef(0)

  useLayoutEffect(() => {
    latest.current = options
  })

  // The asset manager suspends previews too: one it opened during the drag (its hotkey) keeps them suspended.
  const previews = useCallback((suspended: boolean): void => {
    const manager = view?.serviceManager?.getNotePreviewUIManager?.()
    if (suspended) manager?.suspendPreviews()
    else if (!viewStore.getState().isAssetManagerOpen) manager?.resumePreviews()
  }, [view, viewStore])

  const settleBack = useCallback((refused: boolean): void => {
    const { drag } = store.state.getState()
    const bar = frame.current && mainToolbarOf(frame.current.row)
    frame.current = null
    if (!drag) return
    previews(false)
    store.state.setState({
      drag: null, frozenLayout: null, frozenBar: null,
      settle: { id: drag.id, to: drag.from, kind: 'return', travel: motionModeOf(bar) === 'full', refused },
    })
  }, [store, previews])

  const cancel = useCallback((): void => {
    const { drag } = store.state.getState()
    const { layout, available: offered, announce } = latest.current
    if (drag) announce(cancelledMessage(toolbarControl(drag.id).label, drag.from === 'bar' ? barPositions(layout, offered).indexOf(drag.id) + 1 : null))
    settleBack(false)
  }, [store, settleBack])

  const move = useCallback((point: ClientPoint): void => {
    const state = store.state.getState()
    const { drag } = state
    let { frozenBar } = state
    const current = frame.current
    if (!drag || !current) return
    store.pointer.x.set(point.x - current.rowLeft)
    store.pointer.y.set(point.y - current.rowTop)
    const growth = drag.from === 'tray' ? (drag.barWidth ?? 0) + current.gap : 0
    const zone = zoneAt(current.zones, point.x, point.y, growth)
    const refused = zone === 'tray' && !isHideableToolbarControl(drag.id)
    const bar = mainToolbarOf(current.row)
    // Entering the bar, the well opens where the pointer is; the bar reads its thresholds again once it has.
    // A tool from the bar that comes back from outside both zones (or from a refusal) still holds its slot
    // there, so the bar does not grow.
    if (zone === 'bar' && drag.zone !== 'bar' && bar && drag.barWidth !== null) {
      const originHolds = drag.from === 'bar' && (drag.zone === null || drag.refused)
      frozenBar = settledBar(bar, drag.id, drag.barWidth, !originHolds)
      store.state.setState({ frozenBar })
    }
    let after = drag.after
    if (zone === 'bar' && frozenBar) {
      const { x, width } = store.ghost
      after = leftNeighbour(frozenBar.ids, dropIndex(frozenBar.thresholds, current.rowLeft + x.get() + width.get() / 2))
    }
    if (zone !== drag.zone || after !== drag.after || refused !== drag.refused) {
      store.state.setState({ drag: { ...drag, zone, after, refused } })
    }
  }, [store])

  const pickUp = useCallback((id: ToolbarControlId, from: ToolbarPlace, row: Element, point: ClientPoint): void => {
    const zones = zonesOf(row)
    const bar = mainToolbarOf(row)
    if (!zones || !bar) return
    const rowBox = row.getBoundingClientRect()
    frame.current = { row, rowLeft: rowBox.left, rowTop: rowBox.top, zones, gap: parseFloat(bar.win.getComputedStyle(bar).columnGap) || 0 }
    store.pointer.x.set(point.x - rowBox.left)
    store.pointer.y.set(point.y - rowBox.top)
    // Until the ghost has measured itself, a drop is placed by the pointer.
    store.ghost.x.set(point.x - rowBox.left)
    store.ghost.width.set(0)
    const shown = shownBarIds(row)
    const originAfter = from === 'bar' ? leftNeighbour(shown.filter(other => other !== id), shown.indexOf(id)) : null
    const { layout, items } = latest.current
    serial.current += 1
    previews(true)
    store.state.setState({
      pressed: null,
      frozenLayout: layout,
      frozenBar: null,
      drag: {
        id, from, zone: from, after: originAfter, originAfter, barWidth: null,
        pinned: items.find(item => item.id === id)?.pinned ?? false, refused: false,
      },
      ghost: { serial: serial.current, id, from },
    })
  }, [store, previews])

  const drop = useCallback((point: ClientPoint): void => {
    move(point)
    const { drag } = store.state.getState()
    const bar = frame.current && mainToolbarOf(frame.current.row)
    if (!drag || !bar) {
      store.state.setState({ pressed: null })
      return
    }
    const { layout, available: offered, change, announce, hotkeyLabel } = latest.current
    const { id, from, zone, after } = drag
    const label = toolbarControl(id).label
    if (zone === null || drag.refused || (zone === 'bar' && from === 'bar' && after === drag.originAfter)) {
      if (drag.refused) announce(refusedMessage())
      settleBack(drag.refused)
      return
    }
    const before = barPositions(layout, offered)
    if (zone === 'bar') {
      const moved = withControlAfter(layout, id, after)
      const now = barPositions(moved, offered)
      change(from === 'bar' ? 'move' : 'show', latestLayout => withControlAfter(latestLayout, id, after))
      announce(from === 'bar'
        ? movedMessage(label, before.indexOf(id) + 1, now.indexOf(id) + 1)
        : shownMessage(label, now.indexOf(id) + 1, now.length))
    } else {
      change('hide', latestLayout => withControlHidden(latestLayout, id))
      if (from === 'bar') announce(hiddenMessage(label, hotkeyLabel(toolbarControl(id).hotkey)))
    }
    frame.current = null
    previews(false)
    store.state.setState({
      drag: null, frozenLayout: null, frozenBar: null,
      settle: { id, to: zone, kind: 'drop', travel: motionModeOf(bar) === 'full', refused: false },
    })
  }, [store, move, settleBack, previews])

  const press = useCallback((event: React.PointerEvent<HTMLElement>, id: ToolbarControlId, from: ToolbarPlace): void => {
    if (event.button !== 0 || session.current) return
    const row = editorRowOf(event.currentTarget)
    const bar = row && mainToolbarOf(row)
    if (!row || !bar) return
    store.landNow?.()
    store.state.setState({ pressed: id })
    session.current = new ToolbarPointerSession(bar, event.nativeEvent, {
      pickUp: point => pickUp(id, from, row, point),
      move,
      drop: (point) => {
        session.current = null
        drop(point)
      },
      cancel: () => {
        session.current = null
        cancel()
      },
      release: () => {
        session.current = null
        store.state.setState({ pressed: null })
      },
    })
  }, [store, pickUp, move, drop, cancel])

  const allowContextMenu = useCallback((): boolean => session.current?.allowContextMenu() ?? true, [])

  // A drag ends with edit mode: no ghost and nothing stored.
  useEffect(() => {
    if (editing) return undefined
    session.current?.cancel()
    store.landNow?.()
    store.state.setState(IDLE_TOOLBAR_EDIT)
    return undefined
  }, [editing, store])

  // The control the drag holds is gone (Lighting switched off).
  useEffect(() => {
    const dragged = store.state.getState().drag?.id
    if (dragged !== undefined && !available.has(dragged)) session.current?.cancel()
  }, [available, store])

  // The window was resized: the bar the drag measured is not there any more.
  const lastSpace = useRef(space)
  useEffect(() => {
    if (lastSpace.current === space) return
    lastSpace.current = space
    session.current?.cancel()
  }, [space])

  useEffect(() => () => session.current?.cancel(), [])

  return { press, allowContextMenu }
}
