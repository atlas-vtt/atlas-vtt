import type { ToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import type { ToolbarDrag } from './toolbarEditStore'

/** The well's id among the controls the bar's fit sees. */
export const WELL = 'atlas-toolbar-well'

/** What the bar shows of a drag. */
export interface BarDragPreview {
  /** The ids the fit sees, in order: the dragged control left out once it leaves its slot, the well where it would land. */
  fitIds: string[]
  /** The control the well follows (null: the start); undefined while no well opens in the bar. */
  wellAfter: ToolbarControlId | null | undefined
  /** The dragged control's own slot stays open, empty, as the well: over its own place, or outside both zones. */
  originHolds: boolean
}

function withWell(ids: readonly string[], after: string | null): string[] {
  const at = after === null ? 0 : ids.indexOf(after) + 1
  // A control the well follows that is gone meanwhile puts the well at the end.
  const index = after !== null && at === 0 ? ids.length : at
  return [...ids.slice(0, index), WELL, ...ids.slice(index)]
}

/**
 * How the bar previews a drag. `ids` are the controls the bar shows or has
 * in "More tools", in order. A tool taken from the bar keeps its slot as the
 * well while it is over its own place, outside both zones or refused by the
 * tray (the Command palette), so nothing moves at pickup; anywhere else on
 * the bar its slot closes and a well opens after `drag.after`. Over the tray
 * the bar has no well.
 */
export function barDragPreview(ids: readonly string[], drag: ToolbarDrag | null): BarDragPreview {
  if (!drag) return { fitIds: [...ids], wellAfter: undefined, originHolds: false }
  const others = ids.filter(id => id !== drag.id)
  if (drag.from === 'bar') {
    const home = drag.zone === null || drag.refused || (drag.zone === 'bar' && drag.after === drag.originAfter)
    if (home) return { fitIds: [...ids], wellAfter: undefined, originHolds: true }
  }
  if (drag.zone !== 'bar') return { fitIds: others, wellAfter: undefined, originHolds: false }
  return { fitIds: withWell(others, drag.after), wellAfter: drag.after, originHolds: false }
}

/**
 * Whether a control's slot in the tray is open. The dragged tool opens its
 * slot there as the well while it is over the tray (never the Command
 * palette, which the tray refuses); a tool taken from the tray keeps its slot
 * as the well until it is over the bar.
 */
export function trayShows(id: string, hidden: boolean, drag: ToolbarDrag | null): boolean {
  if (!drag || drag.id !== id) return hidden
  if (drag.from === 'tray') return drag.zone !== 'bar'
  return drag.zone === 'tray' && !drag.refused
}
