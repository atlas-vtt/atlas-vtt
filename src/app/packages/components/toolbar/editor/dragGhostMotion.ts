import { animate, motionValue, type AnimationPlaybackControlsWithThen, type MotionValue } from 'framer-motion'
import {
  FADE, LIFT, LIFT_SCALE, OUTSIDE_OPACITY, SETTLE_LIFT, SHAKE, type EditorMotionMode, type EditorSpring,
} from './editorMotion'
import type { GhostValues } from './ToolbarDragGhost'
import type { ToolbarPlace } from './toolbarEditStore'
import type { GhostBox } from './toolbarGhostGeometry'
import { shakeOffset } from './toolbarRefusal'

interface Size {
  width: number
  height: number
}

const AT_ONCE = { duration: 0 }

/**
 * The motion of a dragged ghost: lifted off its control, following the
 * pointer with the spot it was grabbed by, growing or shrinking between the
 * bar's face and the tray's, sinking a little outside both zones, and at the
 * end settling onto a control with the pointer's velocity, or shaking and
 * going back. With reduced motion the lift's scale and the size change snap;
 * the shadow and the opacity cues stay.
 */
export class DragGhostMotion {
  private readonly running = new Set<AnimationPlaybackControlsWithThen>()
  private stopFollowing: (() => void) | null = null
  private lifted = true
  /** Once stopped, nothing moves the ghost's values again: the next drag's ghost shares them. */
  private stopped = false

  constructor(
    private readonly values: GhostValues,
    private readonly pointer: { x: MotionValue<number>; y: MotionValue<number> },
    private readonly sizes: Record<ToolbarPlace, Size>,
    private readonly mode: EditorMotionMode,
    /** Where on the face the pointer holds it, as a share of its width and height. */
    private readonly grab: { x: number; y: number },
    private look: ToolbarPlace,
  ) {}

  /**
   * Tracks an animation until it ends. The promise subscribes at once: an
   * animation that ends in this same tick (already at its target) swaps its
   * finished promise for a new one, which `Promise.all` would wait on forever.
   */
  private run(animation: AnimationPlaybackControlsWithThen): Promise<void> {
    if (this.stopped) {
      animation.stop()
      return Promise.resolve()
    }
    this.running.add(animation)
    return animation.then(() => {
      this.running.delete(animation)
    })
  }

  private spring(transition: EditorSpring): EditorSpring | typeof AT_ONCE {
    return this.mode === 'full' ? transition : AT_ONCE
  }

  /** Starts at the control's box and scale, then lifts and follows the pointer. */
  pickUp(box: GhostBox, scale: number): void {
    const { x, y, width, height, trayLook, shadow } = this.values
    x.set(box.x)
    y.set(box.y)
    width.set(box.width)
    height.set(box.height)
    trayLook.set(this.look === 'tray' ? 1 : 0)
    this.values.scale.set(this.mode === 'full' ? scale : 1)
    this.values.opacity.set(1)
    void this.run(animate(this.values.scale, this.mode === 'full' ? LIFT_SCALE : 1, this.spring(LIFT)))
    void this.run(animate(shadow, 1, this.mode === 'skip' ? AT_ONCE : LIFT))
    this.follow()
  }

  private follow(): void {
    const { x, y, width, height } = this.values
    const place = (): void => {
      x.set(this.pointer.x.get() - this.grab.x * width.get())
      y.set(this.pointer.y.get() - this.grab.y * height.get())
    }
    place()
    const stops = [this.pointer.x, this.pointer.y, width, height].map(value => value.on('change', place))
    this.stopFollowing = () => stops.forEach(stop => stop())
  }

  /** Takes the face of the zone it is over: its real size springs there while the faces crossfade. */
  setLook(look: ToolbarPlace): void {
    if (look === this.look) return
    this.look = look
    const size = this.sizes[look]
    void this.run(animate(this.values.width, size.width, this.spring(LIFT)))
    void this.run(animate(this.values.height, size.height, this.spring(LIFT)))
    void this.run(animate(this.values.trayLook, look === 'tray' ? 1 : 0, this.mode === 'skip' ? AT_ONCE : FADE))
  }

  /** Lifted over a zone; outside both it sinks to its own size and fades a little. */
  setLifted(lifted: boolean): void {
    if (lifted === this.lifted) return
    this.lifted = lifted
    void this.run(animate(this.values.scale, lifted && this.mode === 'full' ? LIFT_SCALE : 1, this.spring(LIFT)))
    void this.run(animate(this.values.opacity, lifted ? 1 : OUTSIDE_OPACITY, this.mode === 'skip' ? AT_ONCE : LIFT))
  }

  /** The damped shake of a refusal (the locked door's), where the ghost was let go. */
  async shake(): Promise<void> {
    this.stopFollowing?.()
    if (this.stopped) return
    const { x } = this.values
    const from = x.get()
    const progress = motionValue(0)
    const stop = progress.on('change', (p) => {
      x.set(from + shakeOffset(p))
    })
    await this.run(animate(progress, 1, { duration: SHAKE.durationMs / 1000, ease: 'linear' }))
    stop()
  }

  /**
   * Springs onto a control, which may still move (a slot opening, a bar
   * recentring): the ghost stands at the control's live box plus an offset
   * that springs to nothing, starting with the pointer's velocity.
   */
  async settle(target: () => GhostBox | null, look: ToolbarPlace, transition: EditorSpring): Promise<void> {
    this.stopFollowing?.()
    if (this.stopped) return
    const { x, y, width, height, scale, shadow, opacity, trayLook } = this.values
    const first = target()
    if (!first) return
    const dx = motionValue(x.get() - first.x)
    const dy = motionValue(y.get() - first.y)
    const place = (): void => {
      if (this.stopped) return
      const box = target() ?? first
      x.set(box.x + dx.get())
      y.set(box.y + dy.get())
    }
    const stops = [dx, dy].map(value => value.on('change', place))
    await Promise.all([
      this.run(animate(dx, 0, { ...transition, velocity: this.pointer.x.getVelocity() })),
      this.run(animate(dy, 0, { ...transition, velocity: this.pointer.y.getVelocity() })),
      this.run(animate(width, first.width, SETTLE_LIFT)),
      this.run(animate(height, first.height, SETTLE_LIFT)),
      this.run(animate(scale, 1, SETTLE_LIFT)),
      this.run(animate(shadow, 0, SETTLE_LIFT)),
      this.run(animate(opacity, 1, SETTLE_LIFT)),
      this.run(animate(trayLook, look === 'tray' ? 1 : 0, FADE)),
    ])
    place()
    stops.forEach(stop => stop())
  }

  /** Jumps every running animation to its end (a new press while the ghost settles). */
  complete(): void {
    for (const animation of Array.from(this.running)) animation.complete()
  }

  stop(): void {
    this.stopped = true
    this.stopFollowing?.()
    for (const animation of Array.from(this.running)) animation.stop()
    this.running.clear()
  }
}
