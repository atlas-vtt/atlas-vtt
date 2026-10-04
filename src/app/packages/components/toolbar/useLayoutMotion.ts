import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { ToolbarLayout } from "../../../toolbar/toolbarLayout"
import { STAGGER_MS } from "./editor/editorMotion"

/** What last changed the stored layout: an action of this view's editor, or anything else (another view). */
export type ToolbarChangeCause = "hide" | "show" | "move" | "reset" | "other"

/** The changes of the stored layout, counted, which the bar and the tray animate by. */
export interface ToolbarMotion {
  /** Bumped by every change of the stored layout and by nothing else, so a window resize never glides. */
  revision: number
  cause: ToolbarChangeCause
  /** The controls whose hidden state the last change flipped, in layout order. */
  flipped: readonly string[]
}

/** How a slot that appears or disappears in this render does so. */
export interface SlotChange {
  /** Open or close its width; otherwise it appears or goes at once. */
  animate: boolean
  delayMs: number
}

export const RESTING_MOTION: ToolbarMotion = { revision: 0, cause: "other", flipped: [] }

/** A reset brings controls back (or sends them away) one after another, in layout order. */
export function slotChange(motion: ToolbarMotion, id: string, animate: boolean): SlotChange {
  const step = motion.cause === "reset" ? motion.flipped.indexOf(id) : -1
  return { animate, delayMs: Math.max(0, step) * STAGGER_MS }
}

function flippedControls(previous: ToolbarLayout, next: ToolbarLayout): string[] {
  return next.order.filter((id) => previous.hidden.has(id) !== next.hidden.has(id))
}

export interface LayoutMotion {
  motion: ToolbarMotion
  /** Called by the editor right before it stores a change, so the change is told apart from others. */
  expect: (cause: ToolbarChangeCause) => void
}

/**
 * Counts the changes of `layout` (a new object only when the stored layout
 * changes) and remembers what caused the last. The count is derived during
 * render, so the slots see a change in the very render that shows it.
 */
export function useLayoutMotion(layout: ToolbarLayout): LayoutMotion {
  const expected = useRef<ToolbarChangeCause | null>(null)
  const [tracked, setTracked] = useState({ layout, motion: RESTING_MOTION })
  let motion = tracked.motion
  if (tracked.layout !== layout) {
    motion = { revision: motion.revision + 1, cause: expected.current ?? "other", flipped: flippedControls(tracked.layout, layout) }
    setTracked({ layout, motion })
  }

  // An expected change is the next one drawn; one that stored nothing must not label a later change.
  useLayoutEffect(() => {
    expected.current = null
  })

  const expect = useCallback((cause: ToolbarChangeCause): void => {
    expected.current = cause
  }, [])

  return { motion, expect }
}
