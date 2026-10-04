import React, { useLayoutEffect, useRef, useState } from 'react'
import { animate, motion, motionValue, useMotionValue } from 'framer-motion'
import { GAP, motionModeOf } from './editorMotion'

interface ToolbarWellProps {
  /** The dragged tool's width in the bar. */
  width: number
  closing: boolean
  onClosed: () => void
}

/**
 * The gap that opens in the bar where a dragged tool would land. It opens its
 * real width from 0, its end margin swallowing the gap before it, and closes
 * the same way; with reduced motion it opens and closes at once. It carries
 * no `data-toolbar-item`, so the bar's measuring never counts it.
 */
export function ToolbarWell({ width, closing, onClosed }: ToolbarWellProps): React.ReactElement {
  const wellRef = useRef<HTMLDivElement>(null)
  const size = useMotionValue(0)
  const margin = useMotionValue(0)
  // How far it is open, 0 to 1; kept when it turns around midway.
  const openness = useRef(0)
  const [moving, setMoving] = useState(true)
  const whenClosed = useRef(onClosed)

  useLayoutEffect(() => {
    whenClosed.current = onClosed
  })

  useLayoutEffect(() => {
    const well = wellRef.current
    if (!well) return undefined
    const bar = well.parentElement
    const gap = bar ? parseFloat(well.win.getComputedStyle(bar).columnGap) || 0 : 0
    const apply = (open: number): void => {
      openness.current = open
      size.set(open * width)
      margin.set((open - 1) * gap)
    }
    const target = closing ? 0 : 1
    const done = (): void => {
      if (closing) whenClosed.current()
      else setMoving(false)
    }
    if (motionModeOf(well) !== 'full') {
      apply(target)
      done()
      return undefined
    }

    setMoving(true)
    const progress = motionValue(openness.current)
    apply(progress.get())
    const stopApplying = progress.on('change', apply)
    const run = animate(progress, target, GAP)
    let live = true
    void run.then(() => {
      if (live) done()
    })
    return () => {
      live = false
      run.stop()
      stopApplying()
    }
  }, [closing, width, size, margin])

  return (
    <motion.div
      ref={wellRef}
      className="atlas-toolbar-spacer"
      aria-hidden="true"
      {...(moving && { 'data-animating': '' })}
      {...(closing && { 'data-collapsing': '' })}
      style={{ width: size, marginInlineEnd: margin }}
    />
  )
}
