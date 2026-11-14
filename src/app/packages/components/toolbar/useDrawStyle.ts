import { useCallback, useMemo } from "react"
import { annotationList } from "../../../annotations/annotationList"
import type { Annotation } from "../../../annotations/annotationTypes"
import { drawCell } from "../../../annotations/drawSizes"
import { levelObjects } from "../../../levels/levelObjects"
import { useAtlasStore, useViewStoreHook } from "../../../react/ViewStoreContext"
import { shownStyle, type DrawStyle, type ShownStyle, type StyleField } from "./drawStyle"
import { pickDrawStyle, selectedAmong } from "./drawStyleStore"

/** What the tools of the Draw tool's bars read and write. */
export interface DrawStyleAccess {
  /** What each tool shows: the style of the selected drawings and texts, else what is drawn next. */
  style: ShownStyle
  /** A pick of one tool (`pickDrawStyle`). */
  pick: <Field extends StyleField>(field: Field, value: DrawStyle[Field]) => void
  /** The drawings and texts of the level shown that are selected. */
  selected: readonly Annotation[]
  /** Every drawing and text of the level shown. */
  annotations: readonly Annotation[]
}

/** The style the Draw tool's bars show, following the selection and the tool's choices. */
export function useDrawStyle(): DrawStyleAccess {
  const store = useViewStoreHook()
  const tool = useAtlasStore((state) => state.drawTool)
  const selectedIds = useAtlasStore((state) => state.selectedIds)
  // The same list while the level's drawings and texts are the same records, whatever else is written.
  const annotations = useAtlasStore((state) => annotationList(levelObjects(state)))
  const cell = useAtlasStore((state) => drawCell(state.grid))
  const selected = useMemo(() => selectedAmong(annotations, selectedIds), [annotations, selectedIds])
  const style = useMemo(() => shownStyle(tool, selected, cell), [tool, selected, cell])
  const pick = useCallback<DrawStyleAccess['pick']>((field, value) => pickDrawStyle(store, field, value), [store])
  return { style, pick, selected, annotations }
}
