import { Cloud, Eraser, Grid3x3, Lasso, Paintbrush, Pentagon, Square, SquareDashed } from "lucide-react"
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
  { value: 'areas', icon: SquareDashed, label: t('fog.areas'), tip: t('fog.areasTip') },
]

/** The shapes fog is drawn with, in the bar's order; a tip says the keys a shape has. */
export const FOG_SHAPES: readonly ToolChoice<FogShape>[] = [
  { value: 'brush', icon: Paintbrush, label: t('toolbar.brush') },
  { value: 'rectangle', icon: Square, label: t('toolbar.rectangle'), tip: t('fog.rectangleTip') },
  { value: 'polygon', icon: Pentagon, label: t('fog.polygon'), tip: t('fog.polygonTip') },
  { value: 'lasso', icon: Lasso, label: t('toolbar.lasso') },
  { value: 'cells', icon: Grid3x3, label: t('fog.cells'), tip: t('fog.cellsTip') },
]

/** The shapes while the tool makes areas: the same buttons, each saying what a shape begun inside an area does. */
export const FOG_AREA_SHAPES: readonly ToolChoice<FogShape>[] = FOG_SHAPES.map((shape) => ({ ...shape, tip: t('fog.areaShapeTip') }))
