import {
  AlignCenter, AlignLeft, AlignRight, Captions, Circle, CircleX, DoorClosed, DoorOpen, Eraser, Flame, Footprints, Gem, KeyRound, Lock, Minus,
  MousePointer2, MoveDiagonal, MoveUpRight, Package, Pencil, Skull, Slash, Square, Stamp, Swords, TriangleAlert, Type, TypeOutline,
} from "lucide-react"
import {
  DEFAULT_DRAW_TOOL, DRAW_MODES, DRAW_SIZES,
  type ClearScope, type DrawDash, type DrawEnds, type DrawFill, type DrawFont, type DrawMode, type DrawSize, type TextAlign, type TextLook,
} from "../../../annotations/annotationTypes"
import { t } from "../../../i18n"
import { DashedIcon, DottedIcon, FONT_ICONS, PlainEndsIcon, SIZE_ICONS, SoftFillIcon, SolidFillIcon, type DrawIcon } from "./drawToolIcons"
import { MAP_COLOR_SWATCHES } from "./mapColorSwatches"
import type { ToolChoice } from "./ToolOptionsBar"

type ModeFace = Omit<ToolChoice<DrawMode>, 'value'>

/** The modes the bar offers, each with its face; a mode without one (Cells) is not built yet. */
const MODE_FACES: Readonly<Partial<Record<DrawMode, ModeFace>>> = {
  select: { icon: MousePointer2, label: t('draw.mode.select'), tip: t('draw.mode.selectTip') },
  pen: { icon: Pencil, label: t('draw.mode.pen') },
  line: { icon: Slash, label: t('draw.mode.line'), tip: t('draw.mode.lineTip') },
  rectangle: { icon: Square, label: t('draw.mode.rectangle') },
  ellipse: { icon: Circle, label: t('draw.mode.ellipse') },
  text: { icon: Type, label: t('draw.mode.text') },
  stamp: { icon: Stamp, label: t('draw.mode.stamp') },
  eraser: { icon: Eraser, label: t('draw.mode.eraser') },
}

/** What a press of the Draw tool does: the modes that are built, in the bar's order. */
export const DRAW_MODE_CHOICES: readonly ToolChoice<DrawMode>[] = DRAW_MODES.flatMap((mode) => {
  const face = MODE_FACES[mode]
  return face ? [{ value: mode, ...face }] : []
})

/** The bar's button for a mode; the default mode's for one the bar does not offer. */
export function drawModeChoice(mode: DrawMode): ToolChoice<DrawMode> {
  return DRAW_MODE_CHOICES.find((choice) => choice.value === mode)
    ?? DRAW_MODE_CHOICES.find((choice) => choice.value === DEFAULT_DRAW_TOOL.mode)
    ?? DRAW_MODE_CHOICES[0]!
}

/** The mode after `mode` in the bar, the first after the last: what the tool's key steps to. */
export function nextDrawMode(mode: DrawMode): DrawMode {
  const index = DRAW_MODE_CHOICES.findIndex((choice) => choice.value === mode)
  return DRAW_MODE_CHOICES[(index + 1) % DRAW_MODE_CHOICES.length]!.value
}

/** What the eraser's key switches to: the eraser, and from it back to the mode in hand before (`before`). */
export function eraserOrBack(mode: DrawMode, before: DrawMode): DrawMode {
  if (mode !== 'eraser') return 'eraser'
  return before === 'eraser' ? DEFAULT_DRAW_TOOL.mode : drawModeChoice(before).value
}

/** A tool of a mode's bar. */
export type DrawToolId =
  | 'color' | 'size' | 'players' | 'layer'
  | 'seeThrough' | 'dash' | 'ends' | 'curved' | 'fill'
  | 'font' | 'look' | 'align' | 'bold' | 'italic'
  | 'icon' | 'eraseWhole' | 'front' | 'back' | 'lock' | 'clear'

/** What every drawing has: first in the bar of every mode that makes or changes drawings, in this order, so they never move between modes. */
export const COMMON_DRAW_TOOLS: readonly DrawToolId[] = ['color', 'size', 'players', 'layer']

/** The tools of each mode, in groups: the common four, then what only the mode has. */
const MODE_TOOLS: Readonly<Partial<Record<DrawMode, readonly (readonly DrawToolId[])[]>>> = {
  select: [COMMON_DRAW_TOOLS, ['front', 'back', 'lock'], ['clear']],
  pen: [COMMON_DRAW_TOOLS, ['seeThrough']],
  line: [COMMON_DRAW_TOOLS, ['dash', 'ends', 'curved', 'fill', 'seeThrough']],
  rectangle: [COMMON_DRAW_TOOLS, ['dash', 'fill']],
  ellipse: [COMMON_DRAW_TOOLS, ['dash', 'fill']],
  text: [COMMON_DRAW_TOOLS, ['font', 'look', 'align', 'bold', 'italic']],
  stamp: [COMMON_DRAW_TOOLS, ['icon']],
  eraser: [['size'], ['eraseWhole'], ['clear']],
}

/** The groups of tools a mode's bar holds; none for a mode that is not built. */
export function drawModeTools(mode: DrawMode): readonly (readonly DrawToolId[])[] {
  return MODE_TOOLS[mode] ?? []
}

/** One row of a tool's menu: a choice, its icon (the button's face while it is the choice made) and its name. */
export interface DrawMenuChoice<Value> {
  value: Value
  icon: DrawIcon
  label: string
}

export const SIZE_CHOICES: readonly DrawMenuChoice<DrawSize>[] = DRAW_SIZES.map((size) => ({ value: size, icon: SIZE_ICONS[size], label: t(`draw.size.${size}`) }))

export const DASH_CHOICES: readonly DrawMenuChoice<DrawDash | null>[] = [
  { value: null, icon: Minus, label: t('draw.line.solid') },
  { value: 'dashed', icon: DashedIcon, label: t('draw.line.dashed') },
  { value: 'dotted', icon: DottedIcon, label: t('draw.line.dotted') },
]

export const ENDS_CHOICES: readonly DrawMenuChoice<DrawEnds | null>[] = [
  { value: null, icon: PlainEndsIcon, label: t('draw.ends.none') },
  { value: 'end', icon: MoveUpRight, label: t('draw.ends.end') },
  { value: 'both', icon: MoveDiagonal, label: t('draw.ends.both') },
]

export const FILL_CHOICES: readonly DrawMenuChoice<DrawFill | null>[] = [
  { value: null, icon: Square, label: t('draw.fill.none') },
  { value: 'soft', icon: SoftFillIcon, label: t('draw.fill.soft') },
  { value: 'solid', icon: SolidFillIcon, label: t('draw.fill.solid') },
]

export const FONT_CHOICES: readonly DrawMenuChoice<DrawFont>[] = [
  { value: 'medieval', icon: FONT_ICONS.medieval, label: t('draw.font.medieval') },
  { value: 'scifi', icon: FONT_ICONS.scifi, label: t('draw.font.scifi') },
  { value: 'mono', icon: FONT_ICONS.mono, label: t('draw.font.mono') },
]

export const LOOK_CHOICES: readonly DrawMenuChoice<TextLook>[] = [
  { value: 'outline', icon: TypeOutline, label: t('draw.look.outline') },
  { value: 'plate', icon: Captions, label: t('draw.look.plate') },
  { value: 'plain', icon: Type, label: t('draw.look.plain') },
]

export const ALIGN_CHOICES: readonly DrawMenuChoice<TextAlign>[] = [
  { value: 'left', icon: AlignLeft, label: t('draw.align.left') },
  { value: 'center', icon: AlignCenter, label: t('draw.align.center') },
  { value: 'right', icon: AlignRight, label: t('draw.align.right') },
]

/** The colours a drawing can take: the map's colours, black and white among them. Each is stored as it is. */
export const DRAW_COLOR_SWATCHES = MAP_COLOR_SWATCHES

/** The symbols the Stamp mode places; keys match `MAP_ICON_SVG` in `pixi/mapIcons.ts`. */
export const STAMP_ICONS: readonly { key: string; icon: DrawIcon }[] = [
  { key: 'door-open', icon: DoorOpen },
  { key: 'door-closed', icon: DoorClosed },
  { key: 'lock', icon: Lock },
  { key: 'key-round', icon: KeyRound },
  { key: 'triangle-alert', icon: TriangleAlert },
  { key: 'skull', icon: Skull },
  { key: 'flame', icon: Flame },
  { key: 'package', icon: Package },
  { key: 'gem', icon: Gem },
  { key: 'swords', icon: Swords },
  { key: 'footprints', icon: Footprints },
  { key: 'circle-x', icon: CircleX },
]

/** What Clear offers, in its menu's order, each with the text of its row on a scene with levels and on one without. */
export const CLEAR_SCOPES: readonly { scope: ClearScope; label: string; labelOnLevel: string }[] = [
  { scope: 'above', label: t('draw.clearAbove'), labelOnLevel: t('draw.clearAbove') },
  { scope: 'level', label: t('draw.clearMap'), labelOnLevel: t('draw.clearLevel') },
  { scope: 'players', label: t('draw.clearPlayers'), labelOnLevel: t('draw.clearPlayers') },
]
