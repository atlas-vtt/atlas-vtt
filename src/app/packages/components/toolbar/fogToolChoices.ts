import { Cloud, DoorOpen, Eraser, Grid3x3, Lasso, Paintbrush, Pentagon, Square } from "lucide-react"
import type { FogShape, FogToolId } from "../../../fog/fogToolChoices"
import { t } from "../../../i18n"
import type { ToolChoice } from "./ToolOptionsBar"

/**
 * The fog tool's two modes, in the bar's order: the tool that adds fog and the one that erases
 * it. They have the faces the toolbar's button shows for them (`fogToolFace`), and say which key
 * turns a stroke around.
 */
export const FOG_MODES: readonly ToolChoice<FogToolId>[] = [
  { value: 'fog', icon: Cloud, label: t('fog.fog'), tip: t('fog.fogTip') },
  { value: 'eraser', icon: Eraser, label: t('fog.eraser'), tip: t('fog.eraserTip') },
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
