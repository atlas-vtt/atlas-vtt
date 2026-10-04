import { useCallback, useState } from 'react'
import type { ToolbarControlId } from '../../../../toolbar/toolbarCatalog'

/** A well in the bar: the gap that opens where a dragged tool would land. */
export interface BarWell {
  key: number
  /** The control it follows; null at the start. */
  after: ToolbarControlId | null
  /** Closing: the drag moved on, or ended without landing here. */
  closing: boolean
}

interface WellState {
  target: ToolbarControlId | null | undefined
  wells: readonly BarWell[]
  next: number
}

export interface BarWells {
  wells: readonly BarWell[]
  /** A closing well has closed. */
  closed: (key: number) => void
}

/**
 * The bar's wells for a drag: one opens after `target` (undefined: none),
 * and the one it replaces closes where it was, so the gap moves through the
 * bar rather than jumping. With `instant` (a drop) every well goes at once,
 * since the dropped control takes the well's place in the same frame.
 */
export function useBarWells(target: ToolbarControlId | null | undefined, instant: boolean): BarWells {
  const [state, setState] = useState<WellState>({ target: undefined, wells: [], next: 0 })
  let current = state
  if (state.target !== target) {
    const kept = instant ? [] : state.wells.map(well => (well.closing ? well : { ...well, closing: true }))
    const opening = target === undefined ? [] : [{ key: state.next, after: target, closing: false }]
    current = { target, wells: [...kept, ...opening], next: state.next + 1 }
    setState(current)
  } else if (instant && state.wells.some(well => well.closing)) {
    current = { ...state, wells: state.wells.filter(well => !well.closing) }
    setState(current)
  }

  const closed = useCallback((key: number): void => {
    setState(previous => ({ ...previous, wells: previous.wells.filter(well => well.key !== key) }))
  }, [])

  return { wells: current.wells, closed }
}
