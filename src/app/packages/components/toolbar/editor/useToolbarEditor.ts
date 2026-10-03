import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MapHotkeyId } from '../../../../keyboard/mapHotkeys'
import { isHideableToolbarControl, toolbarControl, type ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { isDefaultToolbarLayout, withControlHidden, withControlShown, type StoredToolbarLayout, type ToolbarLayout } from '../../../../toolbar/toolbarLayout'
import type { ToolbarLayoutAccess } from '../useToolbarLayout'
import {
  enteredMessage, finishedMessage, hiddenMessage, movedMessage, positionMessage, refusedMessage, resetMessage, shownMessage,
} from './toolbarAnnouncements'
import type { ToolbarEditApi, ToolbarFocusTarget, ToolbarHandleGroup } from './toolbarEditContext'
import type { ToolbarAnnouncement } from './ToolbarLiveRegion'
import { editorRowOf, paletteButtonOf } from './toolbarEditDom'
import { toolbarEditMenu } from './toolbarEditMenus'
import { movedToolbarLayout, type ToolbarMove } from './toolbarMoves'

interface ToolbarEditorOptions {
  access: ToolbarLayoutAccess
  /** The controls this view offers, its gates applied. */
  available: ReadonlySet<ToolbarControlId>
  hotkeyLabel: (id: MapHotkeyId) => string
  editing: boolean
  /** Turns edit mode off in the view's store. */
  stop: () => void
}

export interface ToolbarEditor {
  api: ToolbarEditApi
  announcement: ToolbarAnnouncement
}

type CurrentHandles = Readonly<Record<ToolbarHandleGroup, string | null>>

const NO_CURRENT_HANDLES: CurrentHandles = { bar: null, tray: null }

/** The controls of `layout` this view offers, on the bar (`hidden` false) or in the tray. */
function controlsOf(layout: ToolbarLayout, available: ReadonlySet<ToolbarControlId>, hidden: boolean): ToolbarControlId[] {
  return layout.order.filter(id => available.has(id) && layout.hidden.has(id) === hidden)
}

/**
 * The toolbar editor's state and actions for MainToolbar: hide, show, move,
 * reset and its undo, the end of edit mode, and what the live region says
 * about each. Changes apply to the latest stored layout, so a change another
 * view made meanwhile is kept.
 */
export function useToolbarEditor({ access, available, hotkeyLabel, editing, stop }: ToolbarEditorOptions): ToolbarEditor {
  const { layout, stored, commit } = access
  const [announcement, setAnnouncement] = useState<ToolbarAnnouncement>({ text: '', serial: 0 })
  const [resetFrom, setResetFrom] = useState<StoredToolbarLayout | null>(null)
  const [current, setCurrent] = useState<CurrentHandles>(NO_CURRENT_HANDLES)
  const focusRequest = useRef<ToolbarFocusTarget | null>(null)
  const focusAfterExit = useRef<HTMLElement | null>(null)
  const wasEditing = useRef(editing)

  const announce = useCallback((text: string): void => {
    setAnnouncement(previous => ({ text, serial: previous.serial + 1 }))
  }, [])

  useEffect(() => {
    if (wasEditing.current === editing) return
    wasEditing.current = editing
    announce(editing ? enteredMessage() : finishedMessage())
    if (!editing) {
      setResetFrom(null)
      setCurrent(NO_CURRENT_HANDLES)
    }
  }, [editing, announce])

  // Once the tools are no longer inert, focus can return to the Command palette button.
  useLayoutEffect(() => {
    if (editing) return
    focusAfterExit.current?.focus()
    focusAfterExit.current = null
  }, [editing])

  const finish = useCallback((from?: Element | null): void => {
    const row = editorRowOf(from)
    focusAfterExit.current = row ? paletteButtonOf(row) : null
    stop()
  }, [stop])

  const barIds = controlsOf(layout, available, false)
  const trayIds = controlsOf(layout, available, true)
  const label = (id: ToolbarControlId): string => toolbarControl(id).label

  const change = (update: (latest: ToolbarLayout) => ToolbarLayout, then: ToolbarFocusTarget | undefined): void => {
    focusRequest.current = then ?? null
    setResetFrom(null)
    commit(update)
  }

  const hide = (id: ToolbarControlId, then?: ToolbarFocusTarget): void => {
    if (!isHideableToolbarControl(id)) {
      announce(refusedMessage())
      return
    }
    if (layout.hidden.has(id)) return
    change(latest => withControlHidden(latest, id), then)
    announce(hiddenMessage(label(id), hotkeyLabel(toolbarControl(id).hotkey)))
  }

  const show = (id: ToolbarControlId, then?: ToolbarFocusTarget): void => {
    if (!layout.hidden.has(id)) return
    const bar = controlsOf(withControlShown(layout, id), available, false)
    change(latest => withControlShown(latest, id), then)
    announce(shownMessage(label(id), bar.indexOf(id) + 1, bar.length))
  }

  const move = (id: ToolbarControlId, step: ToolbarMove, then?: ToolbarFocusTarget): void => {
    const moved = movedToolbarLayout(layout, barIds, id, step)
    if (!moved) {
      announce(positionMessage(label(id), barIds.indexOf(id) + 1, barIds.length))
      return
    }
    change(latest => movedToolbarLayout(latest, controlsOf(latest, available, false), id, step)?.layout ?? latest, then)
    announce(movedMessage(label(id), moved.from, moved.to))
  }

  const api: ToolbarEditApi = {
    barIds,
    trayIds,
    current,
    setCurrent: (group, id) => setCurrent(previous => previous[group] === id ? previous : { ...previous, [group]: id }),
    hide,
    show,
    move,
    canReset: !isDefaultToolbarLayout(layout),
    reset: () => {
      if (isDefaultToolbarLayout(layout)) return
      setResetFrom(stored)
      access.reset()
      announce(resetMessage(false))
    },
    canUndoReset: resetFrom !== null && isDefaultToolbarLayout(layout),
    undoReset: () => {
      if (!resetFrom) return
      access.restore(resetFrom)
      setResetFrom(null)
      announce(resetMessage(true))
    },
    finish,
    menuEntries: (id, place, then) => toolbarEditMenu(id, place, { hide: control => hide(control, then), show: control => show(control, then) }),
    takeFocusRequest: () => {
      const target = focusRequest.current
      focusRequest.current = null
      return target
    },
  }

  return { api, announcement }
}
