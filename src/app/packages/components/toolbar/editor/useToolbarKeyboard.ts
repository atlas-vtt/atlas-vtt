import type React from 'react'
import type { ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import { useToolbarEdit, type ToolbarEditApi, type ToolbarFocusTarget, type ToolbarHandleGroup } from './toolbarEditContext'
import { editorRowOf, groupHandles, nearestHandle } from './toolbarEditDom'
import type { ToolbarMove } from './toolbarMoves'
import { useToolbarEditMenu } from './useToolbarEditMenu'

/** Keys the map's shortcuts also use (Tab: DM screen, Space: palette, Enter: dice log). */
const NATIVE_KEYS = new Set(['Tab', ' ', 'Enter'])

const ALT_MOVES: Partial<Record<string, ToolbarMove>> = { ArrowLeft: 'left', ArrowRight: 'right', Home: 'start', End: 'end' }

/**
 * For every control of the editor: Tab, Space and Enter keep their native
 * work (focus, clicks) but never reach the map's shortcuts.
 */
export function stopMapShortcuts(event: React.KeyboardEvent): void {
  if (NATIVE_KEYS.has(event.key)) event.stopPropagation()
}

interface KeyContext {
  edit: ToolbarEditApi
  id: ToolbarControlId
  group: ToolbarHandleGroup
  handle: HTMLElement
  row: Element
  openMenu: (then: ToolbarFocusTarget) => void
}

function focusHandle(handle: HTMLElement | null | undefined): void {
  handle?.focus()
}

/** Where focus goes once a tool leaves its group: the next one there, or the previous at the end. */
function focusAfterLeaving(group: ToolbarHandleGroup, id: string, neighbour: string | undefined): ToolbarFocusTarget {
  if (neighbour) return { group, id: neighbour }
  // An emptied tray hands focus to the tool on the bar.
  return group === 'tray' ? { group: 'bar', id } : 'done'
}

/** Runs what a key does on a focused handle; false for keys the handle leaves alone. */
function runKey(event: React.KeyboardEvent, { edit, id, group, handle, row, openMenu }: KeyContext): boolean {
  const handles = groupHandles(row, group)
  const index = handles.indexOf(handle)
  const afterLeaving = focusAfterLeaving(group, id, (handles[index + 1] ?? handles[index - 1])?.dataset.control)
  const move = ALT_MOVES[event.key]
  if (event.altKey && move && group === 'bar') {
    edit.move(id, move, { group: 'bar', id })
    return true
  }
  if (event.altKey || event.metaKey || event.ctrlKey) return false
  if (event.key === 'F10' && event.shiftKey) {
    openMenu(afterLeaving)
    return true
  }
  switch (event.key) {
    case 'ArrowLeft': focusHandle(handles[index - 1]); return true
    case 'ArrowRight': focusHandle(handles[index + 1]); return true
    case 'Home': focusHandle(handles[0]); return true
    case 'End': focusHandle(handles[handles.length - 1]); return true
    case 'ArrowUp':
      if (group === 'bar') focusHandle(nearestHandle(handle, groupHandles(row, 'tray')))
      return true
    case 'ArrowDown':
      if (group === 'tray') focusHandle(nearestHandle(handle, groupHandles(row, 'bar')))
      return true
    case 'ContextMenu': openMenu(afterLeaving); return true
    case 'Delete':
    case 'Backspace':
      if (group !== 'bar') return false
      edit.hide(id, afterLeaving)
      return true
    case 'Enter':
    case ' ':
      if (group !== 'tray') return false
      edit.show(id, afterLeaving)
      return true
    default: return false
  }
}

/**
 * The keyboard path of a handle: arrows, Home and End move focus (Up and Down
 * between bar and tray), Alt with them moves a bar tool, Delete hides it,
 * Enter or Space shows a tray tool, Shift+F10 or the ContextMenu key opens the
 * menu. Keys it uses are kept from the map's shortcuts and from the browser.
 */
export function useToolbarKeyboard(id: ToolbarControlId, group: ToolbarHandleGroup): (event: React.KeyboardEvent<HTMLElement>) => void {
  const edit = useToolbarEdit()
  const openEditMenu = useToolbarEditMenu()
  return (event) => {
    const handle = event.currentTarget
    const row = editorRowOf(handle)
    const openMenu = (then: ToolbarFocusTarget): void => {
      const rect = handle.getBoundingClientRect()
      openEditMenu(id, group, { x: rect.left, y: rect.bottom }, then)
    }
    if (edit && row && runKey(event, { edit, id, group, handle, row, openMenu })) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    stopMapShortcuts(event)
  }
}
