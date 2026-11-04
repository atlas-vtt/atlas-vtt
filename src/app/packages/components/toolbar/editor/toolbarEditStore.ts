import { createContext, useContext } from 'react'
import { motionValue, type MotionValue } from 'framer-motion'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { ToolbarControlId, ToolbarUnitId } from '../../../../toolbar/toolbarCatalog'
import type { ToolbarLayout } from '../../../../toolbar/toolbarLayout'
import type { ToolbarZone } from './toolbarDropIndex'

/** Where a control lives in the editor: on the bar or in the tray. */
export type ToolbarPlace = 'bar' | 'tray'

/** A tool, or the undo/redo bar, being dragged with the pointer. */
export interface ToolbarDrag {
  id: ToolbarUnitId
  from: ToolbarPlace
  /** null: outside both zones, where the tool's own slot holds the well again. */
  zone: ToolbarZone | null
  /** Over the bar: the shown control the well follows, null for the start. */
  after: ToolbarControlId | null
  /** Taken from the bar: the shown control it followed there. */
  originAfter: ToolbarControlId | null
  /** The tool's width in the bar (the undo/redo bar's own width), measured on the ghost's face; null until it is. */
  barWidth: number | null
  /** The tool stays on the bar when it is full, so its well does too. */
  pinned: boolean
  /** The Command palette over the tray, which refuses it. */
  refused: boolean
}

/** A ghost on its way to a control after the drag: dropped, or going back. */
export interface ToolbarSettle {
  id: ToolbarUnitId
  to: ToolbarPlace
  kind: 'drop' | 'return'
  /** It moves there; otherwise (reduced motion) it goes at once and the control fades in. */
  travel: boolean
  /** The Command palette was let go over the tray: it shakes before it goes back. */
  refused: boolean
}

/** The ghost of the current drag, from pickup until it has landed. */
export interface ToolbarGhostTicket {
  serial: number
  id: ToolbarUnitId
  from: ToolbarPlace
}

/** The bar's thresholds (`dropThresholds`) and the shown controls they belong to, frozen until the bar changes. */
export interface FrozenBar {
  thresholds: readonly number[]
  ids: readonly ToolbarControlId[]
}

export interface ToolbarEditState {
  /** Pressed, not yet dragged. */
  pressed: ToolbarUnitId | null
  drag: ToolbarDrag | null
  settle: ToolbarSettle | null
  ghost: ToolbarGhostTicket | null
  /** The layout when the drag began: changes made elsewhere wait for the drop, so the bar keeps still under the pointer. */
  frozenLayout: ToolbarLayout | null
  frozenBar: FrozenBar | null
}

/** One toolbar's drag state, apart from MainToolbar so that a drag re-renders only the bar and the tray. */
export interface ToolbarEditStore {
  state: StoreApi<ToolbarEditState>
  /** The pointer in the bottom row's coordinates: the ghost follows it without a render. */
  pointer: { x: MotionValue<number>; y: MotionValue<number> }
  /** The ghost's box in the same coordinates; a drop is placed by its centre. */
  ghost: { x: MotionValue<number>; y: MotionValue<number>; width: MotionValue<number>; height: MotionValue<number> }
  /** While a ghost settles or goes back: lands it at once. A new press calls it. */
  landNow: (() => void) | null
}

export const IDLE_TOOLBAR_EDIT: ToolbarEditState = {
  pressed: null,
  drag: null,
  settle: null,
  ghost: null,
  frozenLayout: null,
  frozenBar: null,
}

export function createToolbarEditStore(): ToolbarEditStore {
  return {
    state: createStore<ToolbarEditState>(() => IDLE_TOOLBAR_EDIT),
    pointer: { x: motionValue(0), y: motionValue(0) },
    ghost: { x: motionValue(0), y: motionValue(0), width: motionValue(0), height: motionValue(0) },
    landNow: null,
  }
}

export const ToolbarEditStoreContext = createContext<ToolbarEditStore | null>(null)

// A toolbar rendered on its own (tests, the player view) is never dragged.
const IDLE_STORE = createToolbarEditStore()

export function useToolbarEditStore(): ToolbarEditStore {
  return useContext(ToolbarEditStoreContext) ?? IDLE_STORE
}

/** A slice of this toolbar's drag state; the component renders again only when the slice changes. */
export function useToolbarEditState<T>(selector: (state: ToolbarEditState) => T): T {
  return useStore(useToolbarEditStore().state, selector)
}
