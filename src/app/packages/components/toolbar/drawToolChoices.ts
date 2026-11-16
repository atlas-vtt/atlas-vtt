import {
  Captions, Circle, Eraser, Grid2x2Plus, Grid2x2X, Minus,
  MoveDiagonal, MoveUpRight, PaintBucket, Pencil, Slash, Square, Stamp, Type, TypeOutline,
} from "lucide-react"
import {
  DEFAULT_DRAW_TOOL, DRAW_MODES, DRAW_SIZES,
  type ClearScope, type DrawDash, type DrawEnds, type DrawFill, type DrawFont, type DrawMode, type DrawSize, type GmDrawMode, type TextLook,
} from "../../../annotations/annotationTypes"
import { fillsCells, type CellsGridState } from "../../../annotations/cellsMode"
import { t } from "../../../i18n"
import { DashedIcon, DottedIcon, FONT_ICONS, PlainEndsIcon, SIZE_ICONS, SoftFillIcon, SolidFillIcon, type DrawIcon } from "./drawToolIcons"
import { MAP_COLOR_SWATCHES } from "./mapColorSwatches"
import type { ToolChoice } from "./ToolOptionsBar"

type ModeFace = Omit<ToolChoice<DrawMode>, 'value'>

/** The modes the bar offers, each with its face. */
const MODE_FACES: Readonly<Record<GmDrawMode, ModeFace>> = {
  pen: { icon: Pencil, label: t('draw.mode.pen') },
  line: { icon: Slash, label: t('draw.mode.line'), tip: t('draw.mode.lineTip') },
  rectangle: { icon: Square, label: t('draw.mode.rectangle') },
  ellipse: { icon: Circle, label: t('draw.mode.ellipse') },
  text: { icon: Type, label: t('draw.mode.text'), tip: t('draw.mode.textTip') },
  stamp: { icon: Stamp, label: t('draw.mode.stamp') },
  cells: { icon: PaintBucket, label: t('draw.mode.cells'), tip: t('draw.mode.cellsTip') },
  eraser: { icon: Eraser, label: t('draw.mode.eraser') },
}

/** What a press of the Draw tool does: the modes, in the bar's order. */
export const DRAW_MODE_CHOICES: readonly ToolChoice<DrawMode>[] = DRAW_MODES.map((mode) => ({ value: mode, ...MODE_FACES[mode] }))

/**
 * Why a mode cannot be chosen on a map with this grid, or null: the Cells mode fills the grid's
 * cells, so it needs a grid that is there and shown.
 */
export function drawModeUnavailable(mode: DrawMode, grid: CellsGridState | null | undefined): string | null {
  return mode === 'cells' && !fillsCells(grid) ? t('draw.cellsNeedGrid') : null
}

/**
 * The bar's button for a mode; the default mode's for one that cannot be chosen on a map with
 * this grid (unset: every mode can).
 */
export function drawModeChoice(mode: DrawMode, grid?: CellsGridState | null): ToolChoice<DrawMode> {
  const offered = grid === undefined || drawModeUnavailable(mode, grid) === null
  return (offered ? DRAW_MODE_CHOICES.find((choice) => choice.value === mode) : undefined)
    ?? DRAW_MODE_CHOICES.find((choice) => choice.value === DEFAULT_DRAW_TOOL.mode)
    ?? DRAW_MODE_CHOICES[0]!
}

/** The mode after `mode` in the bar that can be chosen on a map with `grid`, the first after the last: what the tool's key steps to. */
export function nextDrawMode(mode: DrawMode, grid: CellsGridState | null | undefined): DrawMode {
  const index = DRAW_MODE_CHOICES.findIndex((choice) => choice.value === mode)
  for (let step = 1; step <= DRAW_MODE_CHOICES.length; step++) {
    const next = DRAW_MODE_CHOICES[(index + step) % DRAW_MODE_CHOICES.length]!.value
    if (drawModeUnavailable(next, grid) === null) return next
  }
  return mode
}

/** What the eraser's key switches to: the eraser, and from it back to the mode in hand before (`before`). */
export function eraserOrBack(mode: DrawMode, before: DrawMode, grid: CellsGridState | null | undefined): DrawMode {
  if (mode !== 'eraser') return 'eraser'
  return before === 'eraser' ? DEFAULT_DRAW_TOOL.mode : drawModeChoice(before, grid ?? null).value
}

/** A tool of a mode's bar. */
export type DrawToolId =
  | 'color' | 'size' | 'players' | 'layer'
  | 'seeThrough' | 'dash' | 'ends' | 'curved' | 'fill'
  | 'font' | 'look'
  | 'icon' | 'cellsLayer' | 'cellsFill' | 'cellsUnfill' | 'eraseWhole' | 'front' | 'back' | 'lock' | 'group' | 'ungroup' | 'clear' | 'delete'

/** What every drawing has: first in the bar of every mode that makes or changes drawings, in this order, so they never move between modes. */
export const COMMON_DRAW_TOOLS: readonly DrawToolId[] = ['color', 'size', 'players', 'layer']

/** The tools of each mode, in groups: the common four, then what only the mode has. */
const MODE_TOOLS: Readonly<Record<GmDrawMode, readonly (readonly DrawToolId[])[]>> = {
  pen: [COMMON_DRAW_TOOLS, ['seeThrough']],
  line: [COMMON_DRAW_TOOLS, ['dash', 'ends', 'curved', 'fill', 'seeThrough']],
  rectangle: [COMMON_DRAW_TOOLS, ['dash', 'fill']],
  ellipse: [COMMON_DRAW_TOOLS, ['dash', 'fill']],
  text: [COMMON_DRAW_TOOLS, ['font', 'look']],
  stamp: [COMMON_DRAW_TOOLS, ['icon']],
  // A cell has no size but the grid's, and the mode keeps a layer of its own (`cellsLayer`).
  cells: [['color', 'players', 'cellsLayer'], ['cellsFill', 'cellsUnfill']],
  eraser: [['size'], ['eraseWhole'], ['clear']],
}

/** The groups of tools a mode's bar holds; none for the players' Select mode, which the GM's bar does not offer. */
export function drawModeTools(mode: DrawMode): readonly (readonly DrawToolId[])[] {
  return mode === 'select' ? [] : MODE_TOOLS[mode]
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

/** The colours a drawing can take: the map's colours, black and white among them. Each is stored as it is. */
export const DRAW_COLOR_SWATCHES = MAP_COLOR_SWATCHES

/** What the Cells mode does with the cells a drag passes: one of the two, each a button of its bar. */
export const CELLS_CHOICES: Readonly<Record<'cellsFill' | 'cellsUnfill', Omit<ToolChoice<string>, 'value'>>> = {
  cellsFill: { icon: Grid2x2Plus, label: t('draw.cells.fill') },
  cellsUnfill: { icon: Grid2x2X, label: t('draw.cells.unfill'), tip: t('draw.cells.unfillTip') },
}

/** What Clear offers, in its menu's order, each with the text of its row on a scene with levels and on one without. */
export const CLEAR_SCOPES: readonly { scope: ClearScope; label: string; labelOnLevel: string }[] = [
  { scope: 'above', label: t('draw.clearAbove'), labelOnLevel: t('draw.clearAbove') },
  { scope: 'level', label: t('draw.clearMap'), labelOnLevel: t('draw.clearLevel') },
  { scope: 'players', label: t('draw.clearPlayers'), labelOnLevel: t('draw.clearPlayers') },
]
