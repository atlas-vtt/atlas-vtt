/**
 * Where a tool dragged in the toolbar editor would land: which zone the
 * pointer is over and, over the bar, between which two controls. Pure, in
 * client coordinates.
 */

export type ToolbarZone = 'bar' | 'tray'

export interface ClientBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** The bar and the tray as they stood when the drag began. */
export interface FrozenZones {
  bar: ClientBox
  tray: ClientBox | null
}

/** How far beyond the bar and the tray a drop still counts. */
export const ZONE_MARGIN = 24

function within(box: ClientBox, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

/** How far the bar's zone reaches past each side of the bar, besides `ZONE_MARGIN`. */
export interface BarGrowth {
  left: number
  right: number
}

/**
 * The zone under the pointer. Each zone reaches `ZONE_MARGIN` beyond its
 * sides, the tray also above itself and the bar below itself (towards the
 * window's edge), and the gap between the tray and the bar is split at its
 * midline. `barGrowth` widens the bar's zone: a number on both sides (a tool
 * dragged from the tray makes the bar wider by its own width and a gap), or
 * each side by its own (the undo/redo bar's place left of the bar).
 */
export function zoneAt(zones: FrozenZones, x: number, y: number, barGrowth: number | BarGrowth = 0): ToolbarZone | null {
  const { bar, tray } = zones
  const midline = tray ? (tray.bottom + bar.top) / 2 : bar.top - ZONE_MARGIN
  const growth = typeof barGrowth === 'number' ? { left: barGrowth, right: barGrowth } : barGrowth
  const barZone = { left: bar.left - ZONE_MARGIN - growth.left, right: bar.right + ZONE_MARGIN + growth.right, top: midline, bottom: bar.bottom + ZONE_MARGIN }
  if (within(barZone, x, y)) return 'bar'
  if (tray && within({ left: tray.left - ZONE_MARGIN, right: tray.right + ZONE_MARGIN, top: tray.top - ZONE_MARGIN, bottom: midline }, x, y)) return 'tray'
  return null
}

/**
 * The points at which the well moves past each control of the bar. `widths`
 * are those of the bar's shown controls other than the dragged one, in
 * order; `contentLeft` is where the first of them starts once the well is
 * open, and `wellWidth` the dragged tool's width in the bar. Each threshold
 * lies midway between the well's centre just before a control and just after
 * it. None depends on where the well is now, so the index they give grows
 * with x and cannot flip back and forth at a threshold.
 */
export function dropThresholds(contentLeft: number, widths: readonly number[], gap: number, wellWidth: number): number[] {
  let left = contentLeft
  return widths.map((width) => {
    const threshold = left + (width + gap + wellWidth) / 2
    left += width + gap
    return threshold
  })
}

/** How many of the bar's other controls lie left of the slot under `centreX`, the dragged ghost's centre. */
export function dropIndex(thresholds: readonly number[], centreX: number): number {
  return thresholds.filter(threshold => threshold < centreX).length
}

/**
 * The control a slot follows: the shown control left of it, or null for the
 * start. A drop lands right after it in the full order, so controls that are
 * in "More tools", hidden or not offered here keep their places.
 */
export function leftNeighbour<T extends string>(ids: readonly T[], index: number): T | null {
  if (index <= 0 || ids.length === 0) return null
  return ids[Math.min(index, ids.length) - 1] ?? null
}
