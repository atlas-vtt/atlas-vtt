import React from "react"
import { Bookmark, Play, Trash2 } from "lucide-react"
import { ToolButton } from "../primitives/ToolButton"
import { t } from "../../../i18n"
import type { SavedFrameControls } from "./useGlass"

/**
 * The chip of a frame the GM saved, on its top edge beside its number while the pointer is over
 * the frame or the chip: Show players here and Remove. Dragging it moves the frame.
 */
export function SavedFrameChip({ controls, ref }: { controls: SavedFrameControls; ref: React.Ref<HTMLDivElement> }): React.ReactElement {
  const { shown } = controls
  return (
    <div
      ref={ref}
      className="atlas-vtt-toolbar atlas-glass-chip"
      role="group"
      aria-label={t("glass.frameNumber", { number: (shown ?? 0) + 1 })}
      hidden={shown === null}
      onPointerDown={controls.pointerDown}
      onPointerEnter={() => controls.hover(true)}
      onPointerLeave={() => controls.hover(false)}
    >
      <Bookmark className="atlas-glass-chip__icon" aria-hidden="true" />
      <ToolButton icon={Play} label={t("glass.show")} isActive={false} onClick={controls.show} tooltipSide="bottom" />
      <ToolButton icon={Trash2} label={t("glass.remove")} isActive={false} onClick={controls.remove} tooltipSide="bottom" />
    </div>
  )
}
