import type React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { observeResize } from '../../../utils/observeResize'
import { POPOVER_FITS, fitPopover, type PopoverFit, type PopoverPlacement, type ViewFrame } from './popoverFit'

export interface KeepInView {
  /** CSS variables the `atlas-keep-in-view` mixin reads. */
  style: React.CSSProperties
  /** The content is taller than the room and scrolls. */
  capped: boolean
}

/**
 * The view a popover must stay inside: Obsidian clips a leaf's content
 * (`contain: strict` on `.workspace-leaf`), so the closest leaf, else the window.
 */
export function viewFrame(element: HTMLElement): ViewFrame {
  const leaf = element.closest('.workspace-leaf')
  if (leaf) return leaf.getBoundingClientRect()
  const win = element.win
  return { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight }
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
      const shift = applied.current.shiftX
      const rect = element.getBoundingClientRect()
      const box = {
        left: rect.left - shift,
        right: rect.right - shift,
        top: rect.top,
        bottom: rect.bottom,
        contentHeight: Math.max(rect.height, element.scrollHeight),
      }
      const next = fitPopover(box, viewFrame(element), placement)
      const current = applied.current
      if (next.shiftX !== current.shiftX || next.maxHeight !== current.maxHeight) setFit(next)
    }

    update()
    const win = element.win
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
