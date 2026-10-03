import { barSlotOf, isHtmlElement, overflowButtonOf, traySlotOf } from './toolbarEditDom'

/**
 * Where the toolbar editor's ghost stands: a box in the coordinates of the
 * bottom toolbar row, which holds the bar, the tray and the ghost layer.
 * Differences of client rects, so the leaf's frame does not matter.
 */
export interface GhostBox {
  x: number
  y: number
  width: number
  height: number
}

function mix(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function lerpBox(from: GhostBox, to: GhostBox, t: number): GhostBox {
  return { x: mix(from.x, to.x, t), y: mix(from.y, to.y, t), width: mix(from.width, to.width, t), height: mix(from.height, to.height, t) }
}

/** What a slot shows: its content in the bar, its face in the tray; "More tools" shows itself. */
function faceOf(slot: HTMLElement): HTMLElement {
  const face = Array.from(slot.children).find(child => child.classList.contains('atlas-toolbar-item__content') || child.classList.contains('atlas-toolbar-face'))
  return isHtmlElement(face) ? face : slot
}

/** Where a slot's face is drawn now, glide and all: where a flight takes off. */
export function drawnBox(row: Element, slot: HTMLElement): GhostBox {
  const origin = row.getBoundingClientRect()
  const rect = faceOf(slot).getBoundingClientRect()
  return { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height }
}

/**
 * Where a slot's face is laid out: as drawn, less the glide the slot's own
 * transform still adds and at its own size, unscaled ("More tools" grows
 * while it is a drop target), so a ghost lands where the face comes to rest.
 * The face keeps its full size while its slot opens around it.
 */
export function laidOutBox(row: Element, slot: HTMLElement): GhostBox {
  const face = faceOf(slot)
  const drawn = drawnBox(row, slot)
  const transform = slot.win.getComputedStyle(slot).transform
  const glide = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null
  const width = face.offsetWidth
  const height = face.offsetHeight
  return {
    x: drawn.x + (drawn.width - width) / 2 - (glide?.e ?? 0),
    y: drawn.y + (drawn.height - height) / 2 - (glide?.f ?? 0),
    width,
    height,
  }
}

/** The element a flight leaves from or lands on in `place`: the tool's slot, or "More tools" where the bar has no room for it. */
export function flightEnd(row: Element, id: string, place: 'bar' | 'tray'): HTMLElement | null {
  const slot = place === 'bar' ? barSlotOf(row, id) : traySlotOf(row, id)
  if (slot && !slot.hidden) return slot
  return place === 'bar' ? overflowButtonOf(row) : null
}

/**
 * Where a drag's ghost starts: over the control's face as it is drawn, at
 * the face's own size and the scale its press left it at, which the ghost
 * starts from rather than assuming.
 */
export function pickupBox(row: Element, slot: HTMLElement): { box: GhostBox; scale: number } {
  const face = faceOf(slot)
  const drawn = drawnBox(row, slot)
  const width = face.offsetWidth
  const height = face.offsetHeight
  const transform = slot.win.getComputedStyle(face).transform
  const scale = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).a : 1
  return { box: { x: drawn.x + (drawn.width - width) / 2, y: drawn.y + (drawn.height - height) / 2, width, height }, scale }
}
