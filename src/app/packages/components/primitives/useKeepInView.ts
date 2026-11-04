import { getDomHost } from '../../../host/dom';
import type React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { observeResize } from '../../../utils/observeResize'
import { POPOVER_FITS, fitPopover, type PopoverFit, type PopoverPlacement, type ViewFrame } from './popoverFit'

export interface KeepInView {
  /** CSS variables the `atlas-keep-in-view` mixin reads. */
  style: React.CSSProperties
  /** A height cap is applied; shorter content still sizes naturally. */
  capped: boolean
}

/**
 * The view a popover must stay inside: Obsidian clips a leaf's content
 * (`contain: strict` on `.workspace-leaf`), so the closest leaf, else the window.
 */
export function viewFrame(element: HTMLElement): ViewFrame {
  const leaf = element.closest('.workspace-leaf')
  if (leaf) return leaf.getBoundingClientRect()
  const win = getDomHost().ownerWindow(element)
  return { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight }
}

/** Whether an `overflow` value cuts what lies outside the box (an unset one does not). */
const clips = (overflow: string): boolean => overflow !== '' && overflow !== 'visible'

/**
 * The part of the view an element that hangs inside its ancestors can be seen in: the view
 * (`viewFrame`), cut by every ancestor up to the leaf that clips its content (a page that scrolls).
 */
export function clippedViewFrame(element: HTMLElement): ViewFrame {
  // A DOMRect's sides are getters of its prototype, which spreading leaves behind.
  const { left, top, right, bottom } = viewFrame(element)
  const frame = { left, top, right, bottom }
  const leaf = element.closest('.workspace-leaf')
  const win = getDomHost().ownerWindow(element)
  for (let node = element.parentElement; node !== null && node !== leaf; node = node.parentElement) {
    const { overflowX, overflowY } = win.getComputedStyle(node)
    if (!clips(overflowX) && !clips(overflowY)) continue
    const rect = node.getBoundingClientRect()
    frame.left = Math.max(frame.left, rect.left)
    frame.top = Math.max(frame.top, rect.top)
    frame.right = Math.min(frame.right, rect.right)
    frame.bottom = Math.min(frame.bottom, rect.bottom)
  }
  return frame
}

/**
 * Keeps the open popover in `ref` inside its view when the window is small:
 * shifts it sideways off an edge and caps its height to the room it opens
 * into. Measures before paint, when the popover or the window resizes, and
 * when `anchor` changes (pass it for a popover positioned by coordinates).
 */
export function useKeepInView(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  placement: PopoverPlacement,
  anchor?: string,
): KeepInView {
  const [fit, setFit] = useState<PopoverFit>(POPOVER_FITS)
  const applied = useRef(fit)
  applied.current = fit

  useLayoutEffect(() => {
    const element = ref.current
    if (!open || !element) {
      setFit(POPOVER_FITS)
      return undefined
    }

    const update = (): void => {
      // Measure where the popover would sit without the shift already applied.
      const current = applied.current
      const shift = current.shiftX
      const rect = element.getBoundingClientRect()
      const box = {
        left: rect.left - shift,
        right: rect.right - shift,
        top: rect.top,
        bottom: rect.bottom,
        // An inner scrolling panel hides its full height from this wrapper once capped.
        // Keep the cap until close, recalculating it from the room on every update.
        // max-height still lets smaller content shrink and a larger view reveal more.
        contentHeight: current.maxHeight === null ? Math.max(rect.height, element.scrollHeight) : Infinity,
      }
      const next = fitPopover(box, viewFrame(element), placement)
      if (next.shiftX !== current.shiftX || next.maxHeight !== current.maxHeight) setFit(next)
    }

    update()
    const win = getDomHost().ownerWindow(element)
    win.addEventListener('resize', update)
    // Sections that appear while the popover is open (a mode's options) change its height.
    const stopObserving = observeResize([element], update)
    return () => {
      win.removeEventListener('resize', update)
      stopObserving()
    }
  }, [open, placement, ref, anchor])

  const style: Record<string, string> = {}
  if (fit.shiftX !== 0) style['--atlas-keep-in-view-x'] = `${fit.shiftX}px`
  if (fit.maxHeight !== null) style['--atlas-keep-in-view-max-height'] = `${fit.maxHeight}px`
  return { style, capped: fit.maxHeight !== null }
}
