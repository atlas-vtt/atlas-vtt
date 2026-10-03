import React, { useLayoutEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import type { ResponsiveToolbarItem } from '../toolbarTypes'
import { FLIGHT, FLIGHT_SCALE, REDUCED_FADE_OUT } from './editorMotion'
import { ToolbarFace } from './ToolbarFace'
import { drawnBox, flightEnd, laidOutBox, lerpBox, type GhostBox } from './toolbarGhostGeometry'
import type { ToolbarFlight } from './useToolbarFlight'

/** Where a face's first button (the tool's icon) is centred, from the face's left edge. */
function iconCentre(face: HTMLElement | null): number {
  const icon = face?.querySelector<HTMLElement>('.btn')
  return icon ? icon.offsetLeft + icon.offsetWidth / 2 : 0
}

interface ToolbarDragGhostProps {
  flight: ToolbarFlight
  item: Pick<ResponsiveToolbarItem, 'kind' | 'menuEntry'>
  onLanded: (serial: number) => void
}

/**
 * The copy of a tool that moves between the bar and the tray while the real
 * control waits, invisible, at its new place. A flight is driven by its
 * progress: each frame the ghost stands that far between where the tool took
 * off and where its new slot is laid out at that moment, so it lands exactly
 * on a slot that is still opening and on a bar that is still recentring. It
 * changes its real size between the bar's face and the tray's, crossfading
 * the two with their icons kept on one spot, and swells a little and casts a
 * deeper shadow on the way. With reduced motion it fades out where the tool was.
 */
export function ToolbarDragGhost({ flight, item, onLanded }: ToolbarDragGhostProps): React.ReactElement {
  const ghostRef = useRef<HTMLDivElement>(null)
  const barFaceRef = useRef<HTMLDivElement>(null)
  const trayFaceRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const width = useMotionValue(0)
  const height = useMotionValue(0)
  const scale = useMotionValue(1)
  const opacity = useMotionValue(1)
  const progress = useMotionValue(0)
  const toTray = flight.from === 'bar'
  // How far the ghost has turned into the tray's look.
  const trayLook = useTransform(progress, (p: number) => (toTray ? p : 1 - p))
  const barLook = useTransform(trayLook, (look: number) => 1 - look)
  const shadow = useTransform(progress, (p: number) => Math.sin(Math.PI * p))
  const barFaceX = useMotionValue(0)
  const trayFaceX = useMotionValue(0)

  useLayoutEffect(() => {
    // The ghost layer's parent is the bottom toolbar row.
    const row = ghostRef.current?.parentElement?.parentElement
    const takeOff = row ? flightEnd(row, flight.id, flight.from) : null
    if (!row || !takeOff) {
      onLanded(flight.serial)
      return undefined
    }
    const place = (box: GhostBox): void => {
      x.set(box.x)
      y.set(box.y)
      width.set(box.width)
      height.set(box.height)
    }
    const start = drawnBox(row, takeOff)
    place(start)
    // Both faces start at the ghost's left edge; sliding them keeps the two icons on one spot.
    const iconOffset = iconCentre(barFaceRef.current) - iconCentre(trayFaceRef.current)
    const stopAligning = trayLook.on('change', (look) => {
      barFaceX.set(-iconOffset * look)
      trayFaceX.set(iconOffset * (1 - look))
    })
    barFaceX.set(-iconOffset * trayLook.get())
    trayFaceX.set(iconOffset * (1 - trayLook.get()))

    let live = true
    const land = (): void => {
      if (live) onLanded(flight.serial)
    }
    if (!flight.travel) {
      const fade = animate(opacity, 0, REDUCED_FADE_OUT)
      void fade.then(land)
      return () => {
        live = false
        fade.stop()
        stopAligning()
      }
    }

    const stopFollowing = progress.on('change', (p) => {
      const target = flightEnd(row, flight.id, toTray ? 'tray' : 'bar')
      place(target ? lerpBox(start, laidOutBox(row, target), p) : start)
    })
    const travel = animate(progress, 1, FLIGHT)
    const swell = animate(scale, FLIGHT_SCALE.keyframes, FLIGHT_SCALE.transition)
    void travel.then(land)
    return () => {
      live = false
      travel.stop()
      swell.stop()
      stopFollowing()
      stopAligning()
    }
  }, [flight, toTray, onLanded, x, y, width, height, scale, opacity, progress, trayLook, barFaceX, trayFaceX])

  return (
    <motion.div ref={ghostRef} className="atlas-toolbar-ghost" aria-hidden="true" inert style={{ x, y, width, height, scale, opacity }}>
      <motion.div className="atlas-toolbar-ghost__shadow" style={{ opacity: shadow }} />
      <div className="atlas-toolbar-ghost__faces">
        <ToolbarFace ref={barFaceRef} item={item} look="bar" style={{ opacity: barLook, x: barFaceX }} />
        <ToolbarFace ref={trayFaceRef} item={item} look="tray" style={{ opacity: trayLook, x: trayFaceX }} />
      </div>
    </motion.div>
  )
}
