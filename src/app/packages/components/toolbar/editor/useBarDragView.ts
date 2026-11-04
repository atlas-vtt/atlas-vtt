import { useLayoutEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { isToolbarControlId } from '../../../../toolbar/toolbarCatalog'
import type { ToolbarFitItem } from '../toolbarFit'
import type { BarGeometry } from '../toolbarGeometry'
import { settledBar } from './toolbarDragGeometry'
import { barDragPreview, WELL } from './toolbarDragPreview'
import { useToolbarEditState, useToolbarEditStore } from './toolbarEditStore'
import { useBarWells, type BarWell } from './useBarWells'

/** How a slot of the bar takes part in a drag. */
export interface SlotDrag {
  /** Its content is invisible: the tool is in the air and the slot is its well, or closing. */
  lifted: boolean
  /** Pressed, not yet dragged. */
  pressed: boolean
  /** A ghost is settling onto it: invisible until it lands. */
  settling: boolean
  /** With reduced motion it fades in where the drop put it, the ghost gone at once. */
  revealing: boolean
  /** A drop put it where the well was: it appears at full width, in the same frame. */
  instant: boolean
}

export interface BarDragView {
  /** What the fit put into "More tools"; the well among them as `WELL`. */
  overflowing: ReadonlySet<string>
  /** The controls that take part in the fit: the bar's, but a dragged one that left its slot. */
  inFit: ReadonlySet<string>
  wells: readonly BarWell[]
  closeWell: (key: number) => void
  wellWidth: number
  /** "More tools" is where the dragged tool would land: the bar has no room for its well. */
  dropTarget: boolean
  /** A drag or a settle is under way: the bar measures nothing, and its changes animate. */
  active: boolean
  slot: (id: string) => SlotDrag
}

/**
 * What the bar shows of this toolbar's drag: the fit run on the preview
 * order, with the well as one more control as wide as the dragged tool (and
 * pinned when it is), the wells that open and close, and each slot's part.
 * Over the bar it freezes the thresholds the drop is placed by, again
 * whenever the preview's overflow changes, and it teaches the bar's geometry
 * the width of a tool dragged from the tray, which the bar never measured.
 */
export function useBarDragView(
  shown: readonly ToolbarFitItem[],
  fit: (items: readonly ToolbarFitItem[]) => ReadonlySet<string>,
  barRef: RefObject<HTMLElement | null>,
  setGeometry: Dispatch<SetStateAction<BarGeometry | null>>,
): BarDragView {
  const editStore = useToolbarEditStore()
  const drag = useToolbarEditState(state => state.drag)
  const settle = useToolbarEditState(state => state.settle)
  const pressed = useToolbarEditState(state => state.pressed)
  const preview = barDragPreview(shown.map(item => item.id), drag)
  const byId = new Map(shown.map(item => [item.id, item]))
  const fitItems = preview.fitIds.flatMap((id): ToolbarFitItem[] => {
    if (id === WELL) return [{ id, pinned: drag?.pinned ?? false, width: drag?.barWidth ?? undefined }]
    const item = byId.get(id)
    return item ? [item] : []
  })
  const overflowing = fit(fitItems)
  const wellOverflows = overflowing.has(WELL)
  const { wells, closed } = useBarWells(wellOverflows ? undefined : preview.wellAfter, settle?.kind === 'drop')

  const overflowKey = Array.from(overflowing).join(' ')
  // The undo/redo bar never lands in the bar, so it needs no thresholds there.
  const draggedControl = drag !== null && isToolbarControlId(drag.id)
  const overBar = draggedControl && drag.zone === 'bar' && drag.barWidth !== null
  useLayoutEffect(() => {
    const bar = barRef.current
    const current = editStore.state.getState().drag
    if (!bar || !overBar || !current || current.barWidth === null) return
    editStore.state.setState({ frozenBar: settledBar(bar, current.id, current.barWidth) })
  }, [overBar, overflowKey, barRef, editStore])

  // The width the ghost measured stands in, so the drop is fitted as it will be drawn.
  const draggedId = draggedControl ? drag.id : null
  const draggedWidth = drag?.barWidth ?? null
  useLayoutEffect(() => {
    if (draggedId === null || draggedWidth === null) return
    setGeometry(previous => (previous && previous.widths[draggedId] === undefined
      ? { ...previous, widths: { ...previous.widths, [draggedId]: draggedWidth } }
      : previous))
  }, [draggedId, draggedWidth, setGeometry])

  return {
    overflowing,
    inFit: new Set(preview.fitIds),
    wells,
    closeWell: closed,
    wellWidth: drag?.barWidth ?? 0,
    dropTarget: wellOverflows,
    active: drag !== null || settle !== null,
    slot: (id) => {
      const landing = settle?.id === id && settle.to === 'bar'
      return {
        lifted: drag?.id === id,
        pressed: pressed === id && drag === null,
        settling: landing && settle.travel,
        revealing: landing && !settle.travel,
        instant: settle?.kind === 'drop' && settle.id === id,
      }
    },
  }
}
