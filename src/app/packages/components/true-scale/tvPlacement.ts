import type { TvRotation } from "../../../services/tableTvSettings"

/** A place on the TV as a share of its width and height, as the players see it: (0, 0) top left. */
export interface PlacePoint {
  x: number
  y: number
}

const COLUMN: Readonly<Record<string, number>> = { left: 0, right: 1 }
const ROW: Readonly<Record<string, number>> = { top: 0, bottom: 1 }

/** Where a named place (`top-left`, `top`, `center`, `right`…) lies on the TV. */
export function placePoint(place: string): PlacePoint {
  const parts = place.split("-")
  const x = parts.map((part) => COLUMN[part]).find((value) => value !== undefined) ?? 0.5
  const y = parts.map((part) => ROW[part]).find((value) => value !== undefined) ?? 0.5
  return { x, y }
}

/** The place of `places` nearest to `point`, measured in a box of `width` × `height`. */
export function nearestPlace<P extends string>(places: readonly P[], point: PlacePoint, width: number, height: number): P {
  let best = places[0] as P
  let bestDistance = Infinity
  for (const place of places) {
    const at = placePoint(place)
    const distance = Math.hypot((at.x - point.x) * width, (at.y - point.y) * height)
    if (distance < bestDistance) {
      best = place
      bestDistance = distance
    }
  }
  return best
}

const DIRECTIONS: Readonly<Record<string, PlacePoint>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
}

/**
 * The place nearest to `from` that lies the way `key` (an arrow key) points; `from` where none
 * does, and null for a key that is no arrow. Nearer along the arrow wins over nearer across it.
 */
export function placeToward<P extends string>(places: readonly P[], from: P, key: string): P | null {
  const direction = DIRECTIONS[key]
  if (!direction) return null
  const start = placePoint(from)
  let best = from
  let bestScore = Infinity
  for (const place of places) {
    const at = placePoint(place)
    const along = (at.x - start.x) * direction.x + (at.y - start.y) * direction.y
    if (along <= 0) continue
    const across = Math.abs((at.x - start.x) * direction.y) + Math.abs((at.y - start.y) * direction.x)
    const score = along + 2 * across
    if (score < bestScore) {
      best = place
      bestScore = score
    }
  }
  return best
}

/** Width over height of the TV as the players see it: the screen's (`WxH`, 16:9 where it says none), its sides swapped when turned a quarter. */
export function tvAspect(screenKey: string | null, rotation: TvRotation): number {
  const size = screenKey ? /^(\d+)x(\d+)$/.exec(screenKey) : null
  const width = size ? Number(size[1]) : 0
  const height = size ? Number(size[2]) : 0
  const aspect = width > 0 && height > 0 ? width / height : 16 / 9
  return rotation === 90 || rotation === 270 ? 1 / aspect : aspect
}

/** `value` within `min` and `max`, rounded to `step`. */
export function steppedWithin(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round(value / step) * step
  return Math.min(max, Math.max(min, Math.round(stepped * 1000) / 1000))
}
