import type { PreviewWindowLayout } from '../stores/pinnedNotePreviewSlice';
import type { ViewFrame } from '../packages/components/primitives/popoverFit';

interface Size {
  width: number;
  height: number;
}

/** Distance of a preview opened at the pointer from the pointer and from the area's edges. */
const POINTER_GAP = 12;
const EDGE_GAP = 10;

/**
 * Where a preview window currently sits and how large it is, or null while it
 * is hidden: a hidden window measures 0 × 0 at 0, 0.
 */
function readPreviewWindowLayout(element: HTMLElement): PreviewWindowLayout | null {
  if (element.offsetWidth === 0 || element.offsetHeight === 0) return null;
  return {
    left: element.offsetLeft,
    top: element.offsetTop,
    width: element.offsetWidth,
    height: element.offsetHeight,
  };
}

/**
 * The layout as shown within bounds: unchanged when it fits, otherwise shrunk
 * and moved just enough to stay in reach. Unknown bounds (a hidden map view)
 * leave it as it is.
 */
export function fitPreviewWindowLayout(layout: PreviewWindowLayout, bounds: Size): PreviewWindowLayout {
  if (bounds.width === 0 || bounds.height === 0) return layout;
  const width = Math.min(layout.width, bounds.width);
  const height = Math.min(layout.height, bounds.height);
  return {
    left: clamp(layout.left, 0, bounds.width - width),
    top: clamp(layout.top, 0, bounds.height - height),
    width,
    height,
  };
}

/**
 * Where a preview of the given size opens next to the pointer, in the
 * coordinates of the area it is positioned in: beside and below the pointer,
 * flipped to the other side where it would run past the area's edge.
 */
export function previewPositionNearPointer(
  pointer: { x: number; y: number },
  size: Size,
  area: Size,
): { left: number; top: number } {
  const nearAxis = (at: number, extent: number, room: number): number => {
    const after = at + POINTER_GAP;
    const start = after + extent > room - EDGE_GAP ? at - extent - POINTER_GAP : after;
    return Math.max(EDGE_GAP, start);
  };
  return {
    left: nearAxis(pointer.x, size.width, area.width),
    top: nearAxis(pointer.y, size.height, area.height),
  };
}

/** How much of the grab area beside a preview's controls stays in view, in px. */
const GRAB_REACH = 96;

/**
 * The part of a preview window that must stay in view, so it can still be
 * moved, unpinned and closed: its controls and the stretch of its grab area
 * (a header) beside them, up to `GRAB_REACH` px to their left. Null while the
 * window is hidden.
 */
export function previewReach(controls: ViewFrame, grabArea: ViewFrame | null): ViewFrame | null {
  // A hidden window measures nothing, and has nothing to keep in view.
  if (controls.right === controls.left && controls.bottom === controls.top) return null;
  if (!grabArea) return { left: controls.left, top: controls.top, right: controls.right, bottom: controls.bottom };
  return {
    left: Math.min(controls.left, Math.max(grabArea.left, controls.left - GRAB_REACH)),
    top: Math.min(controls.top, grabArea.top),
    right: Math.max(controls.right, grabArea.right),
    bottom: Math.max(controls.bottom, grabArea.bottom),
  };
}

/**
 * The part of `frame` that lies inside every one of `clips`, or null where nothing does: what
 * shows of an element inside the boxes that hold it, such as a header scrolled out of its card.
 */
export function visiblePart(frame: ViewFrame, clips: readonly ViewFrame[]): ViewFrame | null {
  const part = clips.reduce<ViewFrame>((shown, clip) => ({
    left: Math.max(shown.left, clip.left),
    top: Math.max(shown.top, clip.top),
    right: Math.min(shown.right, clip.right),
    bottom: Math.min(shown.bottom, clip.bottom),
  }), frame);
  return part.right > part.left && part.bottom > part.top ? part : null;
}

/**
 * The least shift that brings `reach` inside `frame`, both in the same
 * coordinates. Where the reach does not fit, its top right corner wins: the
 * pin and close buttons of both kinds of preview sit there. An unknown frame
 * (a hidden map view, 0 × 0) asks for no shift.
 */
export function shiftIntoFrame(reach: ViewFrame, frame: ViewFrame): { x: number; y: number } {
  if (frame.right <= frame.left || frame.bottom <= frame.top) return { x: 0, y: 0 };
  return {
    x: Math.min(Math.max(0, frame.left - reach.left), frame.right - reach.right),
    y: Math.max(Math.min(0, frame.bottom - reach.bottom), frame.top - reach.top),
  };
}

/**
 * Keeps a preview window at the place and size the user gave it. That layout
 * is what the map saves; the window shows it fitted to the element it is
 * positioned in (the map's leaf), so a smaller screen shrinks or moves it only
 * while the screen is too small, and never changes what is saved.
 */
export class PreviewWindowPlacement {
  private layout: PreviewWindowLayout | null = null;
  private readonly observer: ResizeObserver;

  constructor(
    private readonly element: HTMLElement,
    private readonly boundsEl: HTMLElement,
  ) {
    this.observer = new ResizeObserver(() => this.show());
    this.observer.observe(boundsEl);
  }

  /** The place and size the user chose, or null before they chose one. */
  getLayout(): PreviewWindowLayout | null {
    return this.layout;
  }

  /** Shows a saved layout. */
  restore(layout: PreviewWindowLayout): void {
    this.layout = layout;
    this.show();
  }

  /** Takes the window's current place and size, after a pin or a resize. */
  recordCurrent(): void {
    this.layout = readPreviewWindowLayout(this.element) ?? this.layout;
  }

  /** Takes the place a drag moved the window to; its size stays, even while it is shown smaller. */
  recordMove(): void {
    const current = readPreviewWindowLayout(this.element);
    if (!current) return;
    this.layout = this.layout ? { ...this.layout, left: current.left, top: current.top } : current;
  }

  /**
   * Opens the window next to the pointer, given in window coordinates. The
   * window is positioned in the map's leaf, not in the window: the leaf has
   * `contain: strict`, which makes it the box of its fixed descendants, and it
   * starts wherever Obsidian's sidebars and tab headers end.
   */
  placeNearPointer(clientX: number, clientY: number): void {
    const area = this.boundsEl.getBoundingClientRect();
    const size = { width: this.element.offsetWidth, height: this.element.offsetHeight };
    const { left, top } = previewPositionNearPointer({ x: clientX - area.left, y: clientY - area.top }, size, area);
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  /** The window follows the pointer again, so no layout of the user's applies. */
  clear(): void {
    this.layout = null;
  }

  destroy(): void {
    this.observer.disconnect();
  }

  private show(): void {
    if (!this.layout) return;
    const bounds = { width: this.boundsEl.clientWidth, height: this.boundsEl.clientHeight };
    const { left, top, width, height } = fitPreviewWindowLayout(this.layout, bounds);
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
    this.element.style.width = `${width}px`;
    this.element.style.height = `${height}px`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
