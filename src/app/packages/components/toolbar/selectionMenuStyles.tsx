import React from "react"
import { isLocked } from "../../../annotations/annotationLock"
import type { Annotation } from "../../../annotations/annotationTypes"
import { drawCell } from "../../../annotations/drawSizes"
import { t } from "../../../i18n"
import type { ContextMenuEntry } from "../../../react/components/context-menu/AtlasContextMenu"
import type { StoreApi } from "zustand"
import type { ViewAtlasState } from "../../../storeFactory"
import { shownValue } from "./drawStyle"
import { pickDrawStyle } from "./drawStyleStore"
import { DRAW_COLOR_SWATCHES, SIZE_CHOICES } from "./drawToolChoices"
import { selectionBarTools } from "./selectionBarTools"

/**
 * The Colour and Size rows of the context menu of drawings and texts, each a submenu of its
 * choices with the one they share ticked, as the bar under a selection has them
 * (`selectionBarTools`: a size only where every selected one has one). A pick changes the
 * selected ones alone, in one undo step. Where every selected one is locked they are disabled
 * rows that say nothing more: the menu's Unlock comes first.
 */
export function selectionMenuStyles(selected: readonly Annotation[], store: StoreApi<ViewAtlasState>): ContextMenuEntry[] {
  const tools = selectionBarTools(selected)[0] ?? []
  const locked = selected.every((annotation) => isLocked(annotation))
  const state = store.getState()
  const cell = drawCell(state.grid)
  const rows: ContextMenuEntry[] = []
  if (tools.includes("color")) {
    const shown = shownValue("color", state.drawTool, selected, cell)
    rows.push(locked ? disabledRow(t("toolbar.colour"), "palette") : {
      type: "submenu",
      label: t("toolbar.colour"),
      icon: "palette",
      children: DRAW_COLOR_SWATCHES.map((swatch) => ({
        type: "item",
        label: swatch.label,
        leading: <span className="atlas-tool-bar__dot" style={{ backgroundColor: swatch.value }} />,
        checked: shown === swatch.value,
        onClick: () => pickDrawStyle(store, "color", swatch.value),
      })),
    })
  }
  if (tools.includes("size")) {
    const shown = shownValue("size", state.drawTool, selected, cell)
    rows.push(locked ? disabledRow(t("draw.size"), "ruler") : {
      type: "submenu",
      label: t("draw.size"),
      icon: "ruler",
      children: SIZE_CHOICES.map((choice) => ({
        type: "item",
        label: choice.label,
        checked: shown === choice.value,
        onClick: () => pickDrawStyle(store, "size", choice.value),
      })),
    })
  }
  return rows
}

function disabledRow(label: string, icon: string): ContextMenuEntry {
  return { type: "item", label, icon, disabled: true, onClick: () => undefined }
}
