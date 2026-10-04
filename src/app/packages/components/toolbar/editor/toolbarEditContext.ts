import { createContext, useContext } from 'react'
import type { ContextMenuEntry } from '../../../../react/root/ContextMenuContext'
import type { ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import type { ToolbarEditPlace } from './toolbarEditMenus'
import type { ToolbarMove } from './toolbarMoves'
import type { ToolbarDragControls } from './useToolbarDrag'
import type { ToolbarFlight } from './useToolbarFlight'

/** A group of handles that share one Tab stop (roving tabindex). */
export type ToolbarHandleGroup = 'bar' | 'tray'

/**
 * Where focus goes once a change is drawn: a control's handle, the tray's
 * Done button, or "More tools" (Done once nothing is left in it).
 */
export type ToolbarFocusTarget = { group: ToolbarHandleGroup; id: string } | 'done' | 'overflow'

/** What the toolbar editor's parts do while edit mode is on in this view. */
export interface ToolbarEditApi extends ToolbarDragControls {
  /** The bar's controls in order: shown and in "More tools", not hidden. Positions count these. */
  barIds: readonly ToolbarControlId[]
  /** The hidden controls this view offers, in their remembered order. */
  trayIds: readonly ToolbarControlId[]
  /** The handle of each group that last had focus; it keeps the group's Tab stop. */
  current: Readonly<Record<ToolbarHandleGroup, string | null>>
  setCurrent: (group: ToolbarHandleGroup, id: string) => void
  /** Each change optionally names where focus goes once it is drawn. */
  hide: (id: ToolbarControlId, then?: ToolbarFocusTarget) => void
  show: (id: ToolbarControlId, then?: ToolbarFocusTarget) => void
  move: (id: ToolbarControlId, move: ToolbarMove, then?: ToolbarFocusTarget) => void
  /** The layout differs from the default. */
  canReset: boolean
  reset: () => void
  /** A reset happened this session and nothing changed since. */
  canUndoReset: boolean
  undoReset: () => void
  /** Ends edit mode; from a control of the editor, focus returns to the Command palette button. */
  finish: (from?: Element | null) => void
  /** `then` is where focus goes after the menu's change (a menu opened from the keyboard). */
  menuEntries: (id: ToolbarControlId, place: ToolbarEditPlace, then?: ToolbarFocusTarget) => ContextMenuEntry[]
  /** The focus target of the last change, once; the editor moves focus there after drawing it. */
  takeFocusRequest: () => ToolbarFocusTarget | null
  /** The tool flying to its new place after the last Hide or Show, if it is still in the air. */
  flight: ToolbarFlight | null
  landFlight: (serial: number) => void
}

export const ToolbarEditContext = createContext<ToolbarEditApi | null>(null)

/** The editor's actions while edit mode is on, else null. */
export function useToolbarEdit(): ToolbarEditApi | null {
  return useContext(ToolbarEditContext)
}
