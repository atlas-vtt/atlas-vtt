/** Distance a popover keeps from the edges of its view, in px. */
export const POPOVER_VIEW_MARGIN = 8

export type PopoverPlacement = 'top' | 'bottom'

/** Where a popover would sit untouched: its box and its full content height. */
export interface PopoverBox {
  left: number
  right: number
  top: number
  bottom: number
  /** Height of the whole content, also when the box is capped and scrolls; `Infinity` keeps a cap that is applied. */
  contentHeight: number
}

export interface ViewFrame {
  left: number
  right: number
  top: number
  bottom: number
}

export interface PopoverFit {
  /** Sideways shift in px that brings the popover inside the view. */
  shiftX: number
  /** Height cap in px when the content is taller than the room, else null. */
  maxHeight: number | null
}

export const POPOVER_FITS: PopoverFit = { shiftX: 0, maxHeight: null }

export interface ListFit {
  /** The list opens above its trigger, because the room below ran out and above is roomier. */
  up: boolean
  /** Height cap in px where the list is taller than the room on its side, else null. */
  maxHeight: number | null
}

export const LIST_FITS: ListFit = { up: false, maxHeight: null }

/**
 * Where a list hanging from a trigger opens (a select's options): below it,
 * above it where below is too short and above is roomier, and no taller than
 * the room on that side, so the view's edge never cuts it. `gap` is the room
 * between trigger and list.
 */
export function fitList(trigger: Pick<ViewFrame, 'top' | 'bottom'>, height: number, frame: ViewFrame, gap: number, margin = POPOVER_VIEW_MARGIN): ListFit {
  const below = frame.bottom - margin - trigger.bottom - gap
  const above = trigger.top - gap - frame.top - margin
  const up = height > below && above > below
  const room = Math.max(0, Math.floor(up ? above : below))
  return !up && height <= room ? LIST_FITS : { up, maxHeight: height > room ? room : null }
}

/**
 * Keeps a popover inside its view: shifts it sideways off the edge it crosses
 * (the left edge wins in a view narrower than the popover, where the start of
 * a menu matters most) and caps its height to the room on the side it opens
 * towards, where it scrolls instead of being clipped.
 */
export function fitPopover(box: PopoverBox, frame: ViewFrame, placement: PopoverPlacement, margin = POPOVER_VIEW_MARGIN): PopoverFit {
  let shiftX = 0
  if (box.right > frame.right - margin) shiftX = frame.right - margin - box.right
  if (box.left + shiftX < frame.left + margin) shiftX = frame.left + margin - box.left

  const room = placement === 'top' ? box.bottom - frame.top - margin : frame.bottom - box.top - margin
  const maxHeight = box.contentHeight > room ? Math.max(0, Math.floor(room)) : null

  return shiftX === 0 && maxHeight === null ? POPOVER_FITS : { shiftX, maxHeight }
}
