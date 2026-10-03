import { withControlAfter, type ToolbarLayout } from '../../../../toolbar/toolbarLayout'
import type { ToolbarControlId } from '../../../../toolbar/toolbarCatalog'

/** A step of a bar control: one place left or right, or to either end. */
export type ToolbarMove = 'left' | 'right' | 'start' | 'end'

export interface MovedToolbarLayout {
  layout: ToolbarLayout
  /** Positions among the bar's controls, counted from 1. */
  from: number
  to: number
}

/**
 * Moves a control among `barIds`, the bar's controls in order (those in
 * "More tools" included, hidden and unavailable ones not). The control lands
 * right after its new left neighbour in the full order, so controls this view
 * does not show keep their places. Null where the control cannot go further.
 */
export function movedToolbarLayout(layout: ToolbarLayout, barIds: readonly ToolbarControlId[], id: ToolbarControlId, move: ToolbarMove): MovedToolbarLayout | null {
  const from = barIds.indexOf(id)
  if (from < 0) return null
  const rest = barIds.filter(other => other !== id)
  const to = { start: 0, end: rest.length, left: Math.max(0, from - 1), right: Math.min(rest.length, from + 1) }[move]
  if (to === from) return null
  return { layout: withControlAfter(layout, id, to === 0 ? null : rest[to - 1]!), from: from + 1, to: to + 1 }
}
