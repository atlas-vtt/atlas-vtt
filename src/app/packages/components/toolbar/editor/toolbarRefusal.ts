import { animate, motionValue, type AnimationPlaybackControlsWithThen } from 'framer-motion'
import { motionModeOf, REFUSAL_TINT_MS, SHAKE } from './editorMotion'
import { slotContentOf } from './toolbarEditDom'

/** The refusal's horizontal offset at progress `p` (0 to 1): the locked door's damped shake. */
export function shakeOffset(p: number): number {
  return Math.sin(p * 2 * Math.PI * SHAKE.cycles) * (1 - p) * SHAKE.amplitudePx
}

const shakes = new WeakMap<HTMLElement, AnimationPlaybackControlsWithThen>()
const tints = new WeakMap<HTMLElement, number>()

function tint(slot: HTMLElement): void {
  slot.win.clearTimeout(tints.get(slot))
  slot.dataset.refused = ''
  tints.set(slot, slot.win.setTimeout(() => slot.removeAttribute('data-refused'), REFUSAL_TINT_MS))
}

function shake(content: HTMLElement): void {
  shakes.get(content)?.stop()
  const progress = motionValue(0)
  const unsubscribe = progress.on('change', (p) => {
    content.style.translate = `${shakeOffset(p)}px 0`
  })
  const animation = animate(progress, 1, { duration: SHAKE.durationMs / 1000, ease: 'linear' })
  shakes.set(content, animation)
  void animation.then(() => {
    unsubscribe()
    // A shake that a newer one replaced leaves the offset to it.
    if (shakes.get(content) !== animation) return
    shakes.delete(content)
    content.style.removeProperty('translate')
  })
}

/**
 * Shows on a bar slot that its control refused what the keyboard asked
 * (Delete on the Command palette, which always stays): its content shakes,
 * or with reduced motion the slot takes the error colour for a moment
 * (`data-refused`). A repeated refusal starts over.
 */
export function refuseVisibly(slot: HTMLElement): void {
  const mode = motionModeOf(slot)
  if (mode === 'skip') return
  if (mode === 'reduced') {
    tint(slot)
    return
  }
  const content = slotContentOf(slot)
  if (content) shake(content)
}
