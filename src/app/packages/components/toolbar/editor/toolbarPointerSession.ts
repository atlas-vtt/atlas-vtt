/** A point in client coordinates. */
export interface ClientPoint {
  x: number
  y: number
}

/** What a press on a handle turns into. */
export interface PointerSessionHandlers {
  /** The pointer moved past the threshold: the drag begins here. */
  pickUp: (point: ClientPoint) => void
  move: (point: ClientPoint) => void
  drop: (point: ClientPoint) => void
  /** The drag ended without a drop: Escape, a cancelled or lost pointer, the window losing focus, or `cancel()`. */
  cancel: () => void
  /** The press ended before it became a drag. */
  release: () => void
}

/** How far a press moves before it is a drag: a mouse is precise, a finger or pen less so. */
export function dragThreshold(pointerType: string): number {
  return pointerType === 'mouse' ? 4 : 8
}

const GRABBING = 'atlas-toolbar-grabbing'

/**
 * One press on a toolbar editor handle, from pointerdown until it ends. Once
 * the press becomes a drag the pointer is captured on the bar, which stays in
 * the document while React moves the controls inside it (moving a captured
 * node would release the capture). Before that nothing is captured, so the
 * context menu a press may open (Ctrl+click on macOS, a long press) goes to
 * the handle, not to the bar. Moves and the release are taken on the window
 * in the capture phase and go no further, so the map underneath never sees
 * the drag. Only the pressing pointer counts.
 */
export class ToolbarPointerSession {
  private dragging = false
  private ended = false
  private readonly origin: ClientPoint
  private readonly pointerId: number
  private readonly threshold: number

  constructor(private readonly bar: HTMLElement, press: PointerEvent, private readonly handlers: PointerSessionHandlers) {
    this.origin = { x: press.clientX, y: press.clientY }
    this.pointerId = press.pointerId
    this.threshold = dragThreshold(press.pointerType)
    bar.win.addEventListener('pointermove', this.onMove, true)
    bar.win.addEventListener('pointerup', this.onUp, true)
    bar.win.addEventListener('pointercancel', this.onCancel, true)
    bar.win.addEventListener('blur', this.onBlur)
    bar.win.addEventListener('contextmenu', this.onContextMenu, true)
    bar.addEventListener('lostpointercapture', this.onLost)
    bar.doc.addEventListener('keydown', this.onKeyDown, true)
  }

  get isDragging(): boolean {
    return this.dragging
  }

  /**
   * A context menu wants to open on the handle: before the threshold the
   * press ends (Ctrl+click on macOS, a long press) and the menu may open;
   * during a drag it may not.
   */
  allowContextMenu(): boolean {
    if (this.dragging) return false
    this.finish()
    return true
  }

  /** Ends the session from outside: edit mode ended, the control went away, the window was resized. */
  cancel(): void {
    this.finish()
  }

  private ours(event: PointerEvent): boolean {
    if (this.ended || event.pointerId !== this.pointerId) return false
    event.stopPropagation()
    return true
  }

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.ours(event)) return
    const point = { x: event.clientX, y: event.clientY }
    if (!this.dragging) {
      if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) < this.threshold) return
      this.dragging = true
      try {
        this.bar.setPointerCapture(this.pointerId)
      } catch {
        // A pointer that is gone already (or no capture at all): the window's listeners still see it.
      }
      this.bar.doc.body.addClass(GRABBING)
      this.handlers.pickUp(point)
    }
    this.handlers.move(point)
  }

  private readonly onUp = (event: PointerEvent): void => {
    if (!this.ours(event)) return
    const dragged = this.dragging
    this.end()
    if (dragged) this.handlers.drop({ x: event.clientX, y: event.clientY })
    else this.handlers.release()
  }

  private readonly onCancel = (event: PointerEvent): void => {
    if (this.ours(event)) this.finish()
  }

  private readonly onLost = (event: PointerEvent): void => {
    if (!this.ended && event.pointerId === this.pointerId) this.finish()
  }

  private readonly onBlur = (): void => {
    this.finish()
  }

  /** During a drag the bar holds the pointer, so a context menu would open there: it never does. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    if (!this.dragging || this.ended) return
    event.preventDefault()
    event.stopPropagation()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || this.ended) return
    // Before the threshold the press just ends, and Escape does what it does anyway (ends edit mode).
    if (this.dragging) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.finish()
  }

  /** Ends the session the way a press or a drag ends when nothing is dropped. */
  private finish(): void {
    if (this.ended) return
    const dragged = this.dragging
    this.end()
    if (dragged) this.handlers.cancel()
    else this.handlers.release()
  }

  private end(): void {
    this.ended = true
    const { bar } = this
    bar.win.removeEventListener('pointermove', this.onMove, true)
    bar.win.removeEventListener('pointerup', this.onUp, true)
    bar.win.removeEventListener('pointercancel', this.onCancel, true)
    bar.win.removeEventListener('blur', this.onBlur)
    bar.win.removeEventListener('contextmenu', this.onContextMenu, true)
    bar.removeEventListener('lostpointercapture', this.onLost)
    bar.doc.removeEventListener('keydown', this.onKeyDown, true)
    bar.doc.body.removeClass(GRABBING)
    try {
      if (bar.hasPointerCapture(this.pointerId)) bar.releasePointerCapture(this.pointerId)
    } catch {
      // Nothing was captured.
    }
  }
}
