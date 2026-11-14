/**
 * The style the Draw tool's bars show and change: that of the selected drawings and texts, else
 * the tool's own, which is what comes next. Pure: what each tool reads of an annotation, and what
 * a pick writes to the selected ones.
 */

import { CURVE_STEPS, curvedPath } from "../../../annotations/shapeOutlines"
import {
  MAX_STROKE_POINTS,
  type Annotation, type AnnotationChanges, type AnnotationPlace, type DrawFont, type DrawingAnnotation, type DrawToolChoices, type TextChanges,
} from "../../../annotations/annotationTypes"
import { sizeOf, stampSize, strokeWidth, textHeight } from "../../../annotations/drawSizes"
import { SEE_THROUGH } from "../../../annotations/madeDrawing"
import { FONT_FAMILIES, TEXT_PLATE } from "../../../annotations/madeText"

/** What a tool shows where the selected annotations differ, or have a value the tool does not offer: no choice. */
export const MIXED = 'mixed'
export type Shown<Value> = Value | typeof MIXED

/** The choices of the tool that are a style: what a drawing or text keeps of them. */
export type StyleField =
  | 'color' | 'size' | 'players' | 'layer' | 'seeThrough' | 'dash' | 'ends' | 'curved' | 'fill'
  | 'font' | 'look' | 'icon'
export type DrawStyle = Pick<DrawToolChoices, StyleField>
export type ShownStyle = { [Field in StyleField]: Shown<DrawStyle[Field]> }

/** What a text has of a plate: taken off with it. Its opacity stays, and is the plate's again when it gets one. */
const NO_PLATE = { backgroundColor: undefined, padding: undefined, borderRadius: undefined } as const
/**
 * A text set in other letters breaks its lines elsewhere: the breaks it saved go, and whoever
 * draws it gives it new ones (`keepTextBreaks`). Read by texts alone.
 */
const RESET = { breaks: undefined } as const

const isStroke = (annotation: Annotation): annotation is DrawingAnnotation => annotation.kind === 'drawing' && annotation.shape !== 'stamp'
const isStamp = (annotation: Annotation): annotation is DrawingAnnotation => annotation.kind === 'drawing' && annotation.shape === 'stamp'
const isText = (annotation: Annotation): boolean => annotation.kind === 'text'
const any = (): boolean => true

/**
 * The annotations each tool is the style of. Size is a line's width, a stamp's side or a text's
 * height, so a fill without a line has none; a fill is a closed line's and arrowheads an open one's.
 */
const STYLED: Readonly<Record<StyleField, (annotation: Annotation) => boolean>> = {
  color: any,
  players: any,
  layer: any,
  size: (annotation) => annotation.kind === 'text' || annotation.width > 0,
  seeThrough: isStroke,
  dash: (annotation) => isStroke(annotation) && annotation.width > 0,
  ends: (annotation) => isStroke(annotation) && !annotation.closed && annotation.points.length >= 2,
  curved: (annotation) => annotation.kind === 'drawing' && annotation.shape === 'line',
  fill: (annotation) => isStroke(annotation) && annotation.closed,
  font: isText,
  look: isText,
  icon: isStamp,
}

/** The face a text's family is, or none of the tool's (a text written before the tool offered any). */
function fontOf(family: string): Shown<DrawFont> {
  const first = family.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
  const fonts = Object.keys(FONT_FAMILIES) as DrawFont[]
  return fonts.find((font) => FONT_FAMILIES[font].toLowerCase() === first) ?? MIXED
}

/** What each tool reads of one annotation it is the style of. */
const READ: { readonly [Field in StyleField]: (annotation: Annotation, cell: number) => Shown<DrawStyle[Field]> } = {
  color: (annotation) => annotation.color.toLowerCase(),
  players: (annotation) => !annotation.hidden,
  layer: (annotation) => annotation.layer,
  size: (annotation, cell) => {
    if (annotation.kind === 'text') return sizeOf(annotation.fontSize * annotation.scale, cell, 'text')
    return sizeOf(annotation.width, cell, annotation.shape === 'stamp' ? 'stamp' : 'stroke')
  },
  seeThrough: (annotation) => annotation.kind === 'drawing' && annotation.opacity < 1,
  dash: (annotation) => (annotation.kind === 'drawing' ? annotation.dash : null),
  ends: (annotation) => (annotation.kind === 'drawing' ? annotation.ends : null),
  curved: (annotation) => annotation.kind === 'drawing' && annotation.anchors !== null,
  fill: (annotation) => (annotation.kind === 'drawing' ? annotation.fill : null),
  font: (annotation) => (annotation.kind === 'text' ? fontOf(annotation.fontFamily) : MIXED),
  look: (annotation) => (annotation.kind === 'text' ? annotation.look : MIXED),
  icon: (annotation) => (annotation.kind === 'drawing' && annotation.icon !== null ? annotation.icon : MIXED),
}

const hasLine = (annotation: Annotation): boolean => annotation.kind === 'drawing' && annotation.width > 0

/**
 * Whether the selected drawings the Fill tool styles are all fills without a line (filled cells,
 * what the eraser left of a fill): none of them can be without a fill, so the tool offers no None.
 */
export function fillIsAll(selected: readonly Annotation[]): boolean {
  const styled = styledBy('fill', selected)
  return styled.length > 0 && !styled.some(hasLine)
}

/** The selected annotations `field` is the style of. */
export function styledBy(field: StyleField, selected: readonly Annotation[]): Annotation[] {
  return selected.filter(STYLED[field])
}

/**
 * What the tool of `field` shows: the value the selected annotations it styles share, `MIXED`
 * where they differ, and the tool's own choice where none of them has such a style.
 */
export function shownValue<Field extends StyleField>(field: Field, tool: DrawStyle, selected: readonly Annotation[], cell: number): Shown<DrawStyle[Field]> {
  const read = READ[field]
  const styled = styledBy(field, selected)
  const first = styled[0]
  if (!first) return tool[field]
  const value = read(first, cell)
  return styled.every((annotation) => read(annotation, cell) === value) ? value : MIXED
}

/** What every tool shows (`shownValue`). */
export function shownStyle(tool: DrawStyle, selected: readonly Annotation[], cell: number): ShownStyle {
  const shown = <Field extends StyleField>(field: Field): Shown<DrawStyle[Field]> => shownValue(field, tool, selected, cell)
  return {
    color: shown('color'), size: shown('size'), players: shown('players'), layer: shown('layer'),
    seeThrough: shown('seeThrough'), dash: shown('dash'), ends: shown('ends'), curved: shown('curved'), fill: shown('fill'),
    font: shown('font'), look: shown('look'), icon: shown('icon'),
  }
}

/** Whether the selected annotations are locked: `MIXED` where some are, null with none selected. */
export function shownLock(selected: readonly Annotation[]): Shown<boolean> | null {
  const first = selected[0]
  if (!first) return null
  return selected.every((annotation) => annotation.locked === first.locked) ? first.locked : MIXED
}

/**
 * One write to the store: a change to several annotations (`updateAnnotations`), a new place for
 * each (`placeAnnotations`), or a change to texts in the fields that are a drawing's own under
 * the same name (`updateText`: a plate's opacity).
 */
export type StyleWrite =
  | { kind: 'update'; ids: string[]; changes: AnnotationChanges }
  | { kind: 'place'; places: Record<string, AnnotationPlace> }
  | { kind: 'text'; ids: string[]; changes: TextChanges }

const idsOf = (annotations: readonly Annotation[]): string[] => annotations.map(({ id }) => id)
const update = (annotations: readonly Annotation[], changes: AnnotationChanges): StyleWrite[] =>
  (annotations.length > 0 ? [{ kind: 'update', ids: idsOf(annotations), changes }] : [])

/**
 * The lines among `styled` as a curve through their corners, or with their corners back. A line
 * whose curve would be too long to read stays as it is.
 */
function curvedPlaces(styled: readonly Annotation[], curved: boolean): StyleWrite[] {
  const places: Record<string, AnnotationPlace> = {}
  for (const annotation of styled) {
    if (annotation.kind !== 'drawing' || (annotation.anchors !== null) === curved) continue
    const { closed, points, anchors } = annotation
    if (anchors) {
      places[annotation.id] = { points: closed ? [...anchors, anchors[0]!] : [...anchors], anchors: undefined }
    } else {
      const corners = closed ? points.slice(0, -1) : [...points]
      if (corners.length < 2 || corners.length * CURVE_STEPS + 1 > MAX_STROKE_POINTS) continue
      places[annotation.id] = { points: curvedPath(corners, closed), anchors: corners }
    }
  }
  return Object.keys(places).length > 0 ? [{ kind: 'place', places }] : []
}

/**
 * What a pick of `value` for `field` writes to the selected annotations the field styles; nothing
 * where it styles none of them, and the pick is the tool's own. A size is written as the pixels
 * it comes to on a map with cells of `cell`; a text gets it as its height, without the scale its
 * handles gave it, and keeps the width its lines wrap at on the map.
 */
export function styleWrites<Field extends StyleField>(field: Field, value: DrawStyle[Field], selected: readonly Annotation[], cell: number): StyleWrite[] {
  const styled = styledBy(field, selected)
  if (styled.length === 0) return []
  const style: Partial<DrawStyle> = {}
  style[field] = value
  const { color, size, players, layer, seeThrough, dash, ends, curved, fill, font, look, icon } = style
  if (color !== undefined) return update(styled, { color })
  if (players !== undefined) return update(styled, { hidden: players ? undefined : true })
  if (layer !== undefined) return update(styled, { layer: layer === 'map' ? 'map' : undefined })
  if (size !== undefined) {
    const fontSize = textHeight(size, cell)
    // A text's wrap width is in its letters' pixels before the scale: one that was scaled wraps where it did only with the scale in its width.
    const places: Record<string, AnnotationPlace> = {}
    for (const annotation of styled) {
      if (annotation.kind === 'text' && annotation.width !== null && annotation.scale !== 1) places[annotation.id] = { width: annotation.width * annotation.scale, fontSize, scale: undefined, ...RESET }
    }
    // `width` reaches drawings alone and the other two texts alone, so lines and texts share a write; a stamp's width is its side.
    return [
      ...update(styled.filter((annotation) => !isStamp(annotation) && !places[annotation.id]), { width: strokeWidth(size, cell), fontSize, scale: undefined, ...RESET }),
      ...update(styled.filter(isStamp), { width: stampSize(size, cell) }),
      ...(Object.keys(places).length > 0 ? [{ kind: 'place' as const, places }] : []),
    ]
  }
  if (seeThrough !== undefined) return update(styled, { opacity: seeThrough ? SEE_THROUGH : 1 })
  if (dash !== undefined) return update(styled, { dash: dash ?? undefined })
  if (ends !== undefined) return update(styled, { ends: ends ?? undefined })
  if (curved !== undefined) return curvedPlaces(styled, curved)
  // A drawing without a line is nothing but its fill: taken off, it would be left in the scene and shown by nothing.
  if (fill !== undefined) return update(fill === null ? styled.filter(hasLine) : styled, { fill: fill ?? undefined })
  if (font !== undefined) return update(styled, { fontFamily: FONT_FAMILIES[font], ...RESET })
  if (look !== undefined) {
    const changes: TextChanges = look === 'plate' ? { ...TEXT_PLATE, outline: undefined } : { ...NO_PLATE, outline: look === 'outline' ? true : undefined }
    return [{ kind: 'text', ids: idsOf(styled), changes }]
  }
  if (icon !== undefined) return update(styled, { icon })
  return []
}
