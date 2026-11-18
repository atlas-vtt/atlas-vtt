/**
 * Where a bar of a selection stands, in the pixels of the area it is placed in: centred on the
 * side it prefers of what the selection shows (its frame, handles and turn handle included), and
 * on the other side where the room on that side runs out (the toolbars, the window's edge). The
 * bar under drawings and texts prefers to stand below, the bar of a selection's actions above. It
 * keeps the side it took for as long as that side holds, so a selection dragged up and down near
 * an edge does not make the bar jump from one side to the other at every step.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export type BarPlaceSide = "below" | "above"

export interface BarPlaceInput {
  /** What the frame shows on screen, in the area's pixels: its corners with their handles, and its turn handle. */
  readonly shown: readonly Point[]
  /** The bar's own size. */
  readonly size: { readonly width: number; readonly height: number }
  /** The area the bar stands in. */
  readonly area: { readonly width: number; readonly height: number }
  /** What of the area's top and bottom bars cover. */
  readonly inset: { readonly top: number; readonly bottom: number }
  /** The side the bar stands on now; null for a bar that takes its place anew. */
  readonly current: BarPlaceSide | null
  /** The side the bar takes where it has the room; below unless said. */
  readonly prefer?: BarPlaceSide | undefined
  /** Panels at the area's left and right edges, which the bar keeps beside where it stands level with them. */
  readonly sides?: readonly Rect[] | undefined
  /** The width of the bar's part that is centred on the selection, the rest hanging to its right; the whole bar unless said. */
  readonly centred?: number | undefined
}

export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface BarPlace {
  /** The bar's top left corner. */
  readonly x: number
  readonly y: number
  readonly side: BarPlaceSide
  /** The point of the bar it grows out of: the middle of its edge that faces the selection, kept on the bar. */
  readonly origin: Point
}

/** Between what the frame shows and the bar. */
export const BAR_GAP = 12
/** Between the bar and the area's edges or the bars there. */
export const BAR_MARGIN = 8

/** The bar's place for `input` (see the module). */
export function placeSelectionBar({ shown, size, area, inset, current, prefer = "below", sides = [], centred = size.width }: BarPlaceInput): BarPlace {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { x, y } of shown) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const top = inset.top + BAR_MARGIN
  const bottom = area.height - inset.bottom - BAR_MARGIN
  const at = { below: maxY + BAR_GAP, above: minY - BAR_GAP - size.height }
  const fits = { below: at.below + size.height <= bottom, above: at.above >= top }
  const other: BarPlaceSide = prefer === "below" ? "above" : "below"
  // A bar on the other side stays there while it fits (or fits on neither side); any other goes there only where it fits there and not on the side it prefers.
  const standsOther = current === other ? fits[other] || !fits[prefer] : fits[other] && !fits[prefer]
  const side: BarPlaceSide = standsOther ? other : prefer
  // Where neither side has the room (a selection as tall as the view), the bar stays inside the view, over the selection.
  const y = clamp(at[side], top, Math.max(top, bottom - size.height))
  let left = BAR_MARGIN
  let right = area.width - BAR_MARGIN
  for (const panel of sides) {
    if (panel.top >= y + size.height || panel.bottom <= y) continue
    if (panel.left + panel.right < area.width) left = Math.max(left, panel.right + BAR_MARGIN)
    else right = Math.min(right, panel.left - BAR_MARGIN)
  }
  const middle = (minX + maxX) / 2
  const x = clamp(middle - centred / 2, left, Math.max(left, right - size.width))
  return { x, y, side, origin: { x: clamp(middle - x, 0, size.width), y: side === "below" ? 0 : size.height } }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
