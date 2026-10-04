import { useLayoutEffect, useRef, useState, type RefObject } from "react"
import { animate, motionValue, MotionGlobalConfig, useMotionValue, type MotionValue } from "framer-motion"
import { FADE, GAP, motionModeOf, REDUCED_FADE_IN } from "./editor/editorMotion"
import type { SlotChange } from "./useLayoutMotion"

type Phase = "rest" | "entering" | "leaving"

interface SlotState {
  shown: boolean
  phase: Phase
  delayMs: number
}

export interface SlotPresence {
  /** Laid out: shown, or still closing. A slot that is not open carries `hidden`. */
  open: boolean
  /** `data-animating` while its width moves (the bar's measuring skips it), `data-collapsing` while it closes. */
  attributes: { "data-animating"?: ""; "data-collapsing"?: "" }
  style: { width: MotionValue<string>; marginInlineEnd: MotionValue<string> }
  contentStyle: { opacity: MotionValue<number> }
}

function px(value: string): number {
  return parseFloat(value) || 0
}

/**
 * A slot of the bar or the tray appearing and disappearing. With `animate` it
 * opens its real width from 0 while its content fades in, its end margin
 * swallowing the gap before it, and closes the same way before it takes
 * `hidden`; otherwise, and whenever Motion's animations are skipped, it
 * appears and goes at once. With reduced motion it goes at once and appears
 * at full width, fading in. A change midway turns it around from where it is.
 * `onSettle` runs once a moving slot is at rest, so the bar can measure it.
 */
export function useSlotPresence(
  slotRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  shown: boolean,
  change: SlotChange,
  onSettle?: () => void,
): SlotPresence {
  const width = useMotionValue("auto")
  const margin = useMotionValue("0px")
  const opacity = useMotionValue(1)
  // How far the slot is open, 0 to 1; kept across a change midway.
  const openness = useRef(shown ? 1 : 0)
  const moved = useRef(false)
  const [state, setState] = useState<SlotState>({ shown, phase: "rest", delayMs: 0 })

  let current = state
  if (state.shown !== shown) {
    const animated = change.animate && !MotionGlobalConfig.skipAnimations
    current = { shown, phase: animated ? (shown ? "entering" : "leaving") : "rest", delayMs: change.delayMs }
    setState(current)
  }
  const { phase, delayMs } = current

  useLayoutEffect(() => {
    const slot = slotRef.current
    const content = contentRef.current
    if (phase === "rest" || !slot || !content) {
      openness.current = shown ? 1 : 0
      width.set("auto")
      margin.set("0px")
      opacity.set(1)
      if (moved.current && slot && content) {
        // Motion draws these in its next frame, after it has measured the bar for a glide; a slot
        // stopped midway (a drop where it was closing) must stand at its full size before that.
        slot.style.width = width.get()
        slot.style.marginInlineEnd = margin.get()
        content.style.opacity = String(opacity.get())
      }
      if (moved.current) onSettle?.()
      moved.current = false
      return undefined
    }

    moved.current = true
    let live = true
    const settle = (): void => {
      if (live) setState((previous) => (previous.phase === "rest" ? previous : { ...previous, phase: "rest" }))
    }
    const mode = motionModeOf(slot)
    const entering = phase === "entering"
    if (mode === "skip" || (mode === "reduced" && !entering)) {
      settle()
      return () => { live = false }
    }

    const delay = delayMs / 1000
    if (entering && openness.current === 0) opacity.set(0)
    const fade = animate(opacity, entering ? 1 : 0, { ...(mode === "reduced" ? REDUCED_FADE_IN : FADE), delay })
    if (mode === "reduced") {
      openness.current = 1
      void fade.then(settle)
      return () => { live = false; fade.stop() }
    }

    const style = slot.win.getComputedStyle(content)
    const full = px(style.width)
    const gap = slot.parentElement ? px(slot.win.getComputedStyle(slot.parentElement).columnGap) : 0
    const progress = motionValue(openness.current)
    const apply = (open: number): void => {
      openness.current = open
      width.set(`${open * full}px`)
      margin.set(`${(open - 1) * gap}px`)
    }
    apply(progress.get())
    const stopApplying = progress.on("change", apply)
    const size = animate(progress, entering ? 1 : 0, { ...GAP, delay })
    void size.then(settle)
    return () => {
      live = false
      size.stop()
      fade.stop()
      stopApplying()
    }
  }, [phase, delayMs, shown, slotRef, contentRef, width, margin, opacity, onSettle])

  return {
    open: shown || phase === "leaving",
    attributes: {
      ...(phase !== "rest" && { "data-animating": "" as const }),
      ...(phase === "leaving" && { "data-collapsing": "" as const }),
    },
    style: { width, marginInlineEnd: margin },
    contentStyle: { opacity },
  }
}

/**
 * Whether `value` differs from what it was in the last committed render. Read
 * from committed state only, so rendering twice gives the same answer.
 */
export function useChangedSinceCommit<T>(value: T): boolean {
  const committed = useRef(value)
  useLayoutEffect(() => {
    committed.current = value
  })
  return committed.current !== value
}
