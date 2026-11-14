/**
 * Where the bar under a selection of drawings and texts stands, in the pixels of the area it is
 * placed in: centred under what the frame shows (its handles and turn handle included), and above
 * it where the room below runs out (the toolbars, the window's edge). It keeps the side it took
 * for as long as that side holds, so a selection dragged up and down near an edge does not make
 * the bar jump from one side to the other at every step.
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
export function placeSelectionBar({ shown, size, area, inset, current }: BarPlaceInput): BarPlace {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { x, y } of shown) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  const top = inset.top + BAR_MARGIN
  const bottom = area.height - inset.bottom - BAR_MARGIN
  const below = maxY + BAR_GAP
  const above = minY - BAR_GAP - size.height
  const fitsBelow = below + size.height <= bottom
  const fitsAbove = above >= top
  // A bar above stays there while it fits (or fits on neither side); any other goes above only where it fits there and not below.
  const standsAbove = current === "above" ? fitsAbove || !fitsBelow : fitsAbove && !fitsBelow
  const side: BarPlaceSide = standsAbove ? "above" : "below"
  // Where neither side has the room (a selection as tall as the view), the bar stays inside the view, over the selection.
  const wanted = side === "below" ? below : above
  const y = clamp(wanted, top, Math.max(top, bottom - size.height))
  const middle = (minX + maxX) / 2
  const x = clamp(middle - size.width / 2, BAR_MARGIN, Math.max(BAR_MARGIN, area.width - BAR_MARGIN - size.width))
  return { x, y, side, origin: { x: clamp(middle - x, 0, size.width), y: side === "below" ? 0 : size.height } }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
