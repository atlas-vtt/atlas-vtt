import { Cloud, Eraser, Lasso, Paintbrush, Square, SquareDashed } from "lucide-react"
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
  { value: 'areas', icon: SquareDashed, label: t('fog.areas') },
]

/** The shapes a stroke is drawn with, in the bar's order. */
export const FOG_SHAPES: readonly ToolChoice<FogShape>[] = [
  { value: 'brush', icon: Paintbrush, label: t('toolbar.brush') },
  { value: 'rectangle', icon: Square, label: t('toolbar.rectangle') },
  { value: 'lasso', icon: Lasso, label: t('toolbar.lasso') },
]
