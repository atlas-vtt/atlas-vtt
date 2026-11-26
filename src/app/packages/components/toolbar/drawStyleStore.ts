/** The Draw tool's style in a view's store: what is selected there, and a pick written to it. */

import { annotationList } from "../../../annotations/annotationList"
import type { Annotation } from "../../../annotations/annotationTypes"
import { drawCell, steppedSize } from "../../../annotations/drawSizes"
import { levelObjects } from "../../../levels/levelObjects"
import type { StoreApi } from "zustand"
import type { ViewAtlasState } from "../../../storeFactory"
import { runHistoryTransaction } from "../../../stores/history"
import { MIXED, shownValue, styleWrites, type DrawStyle, type StyleField } from "./drawStyle"

const NONE: readonly Annotation[] = []

/** The drawings and texts among `selectedIds`, in the order they are drawn. */
export function selectedAmong(annotations: readonly Annotation[], selectedIds: readonly string[]): readonly Annotation[] {
  if (selectedIds.length === 0 || annotations.length === 0) return NONE
  const ids = new Set(selectedIds)
  const selected = annotations.filter((annotation) => ids.has(annotation.id))
  return selected.length > 0 ? selected : NONE
}

/** The drawings and texts of the level shown that are selected. */
export function selectedAnnotations(state: ViewAtlasState): readonly Annotation[] {
  return selectedAmong(annotationList(levelObjects(state)), state.selectedIds)
}

/**
 * A pick in the Draw tool's bars or in the bar under a selection. With drawings or texts selected
 * that the pick is a style of, they take it, in one undo step. While the Draw tool is in hand it
 * also becomes what is drawn next: there the selected one is the stamp or the text just made, and
 * the next is expected to look like it. With any other tool a pick changes the selected ones alone.
 */
export function pickDrawStyle<Field extends StyleField>(store: StoreApi<ViewAtlasState>, field: Field, value: DrawStyle[Field]): void {
  const state = store.getState()
  const writes = styleWrites(field, value, selectedAnnotations(state), drawCell(state.grid))
  if (state.activeTool === 'draw') {
    const next: Partial<DrawStyle> = {}
    next[field] = value
    state.setDrawTool(next)
  }
  if (writes.length === 0) return
  runHistoryTransaction(store, () => {
    for (const write of writes) {
      if (write.kind === 'update') state.updateAnnotations(write.ids, write.changes)
      else if (write.kind === 'place') state.placeAnnotations(write.places)
      else for (const id of write.ids) state.updateText(id, write.changes)
    }
  })
}

/** Steps the size up or down: that of what is selected where it has one size, else the tool's. */
export function stepDrawSize(store: StoreApi<ViewAtlasState>, step: 1 | -1): void {
  const state = store.getState()
  const shown = shownValue('size', state.drawTool, selectedAnnotations(state), drawCell(state.grid))
  pickDrawStyle(store, 'size', steppedSize(shown === MIXED ? state.drawTool.size : shown, step))
}
