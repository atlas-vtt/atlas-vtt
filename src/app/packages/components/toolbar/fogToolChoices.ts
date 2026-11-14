import { Cloud, DoorOpen, Eraser, Grid3x3, Lasso, Paintbrush, Pentagon, Square } from "lucide-react"
import type { FogShape, FogWhat } from "../../../fog/fogToolChoices"
import { t } from "../../../i18n"
import type { ToolChoice } from "./ToolOptionsBar"

/**
 * What the fog tool does with a stroke, in the bar's order. Hide and Reveal have the faces the
 * toolbar's button shows for them (`fogToolFace`), and say which key turns a stroke around.
 */
export const FOG_WHATS: readonly ToolChoice<FogWhat>[] = [
  { value: 'hide', icon: Cloud, label: t('fog.hide'), tip: t('fog.hideTip') },
  { value: 'reveal', icon: Eraser, label: t('fog.reveal'), tip: t('fog.revealTip') },
]

/** The shapes fog is drawn with, in the bar's order; a tip says the keys a shape has. */
export const FOG_SHAPES: readonly ToolChoice<FogShape>[] = [
  { value: 'brush', icon: Paintbrush, label: t('toolbar.brush') },
  { value: 'rectangle', icon: Square, label: t('toolbar.rectangle'), tip: t('fog.rectangleTip') },
  { value: 'polygon', icon: Pentagon, label: t('fog.polygon'), tip: t('fog.polygonTip') },
  { value: 'lasso', icon: Lasso, label: t('toolbar.lasso') },
  { value: 'cells', icon: Grid3x3, label: t('fog.cells'), tip: t('fog.cellsTip') },
  { value: 'room', icon: DoorOpen, label: t('fog.room'), tip: t('fog.roomTip') },
]
