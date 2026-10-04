import { useLayoutEffect } from 'react'
import { animate, motionValue } from 'framer-motion'
import { FLIGHT, FLIGHT_SCALE, REDUCED_FADE_OUT } from './editorMotion'
import type { GhostElements, GhostValues } from './ToolbarDragGhost'
import { drawnBox, flightEnd, laidOutBox, lerpBox, type GhostBox } from './toolbarGhostGeometry'
import type { ToolbarFlight } from './useToolbarFlight'

/**
 * Flies a ghost after Hide, Show on toolbar, Delete or Enter. The flight is
 * driven by its progress: each frame the ghost stands that far between where
 * the tool took off and where its new slot is laid out at that moment, so it
 * lands exactly on a slot that is still opening and on a bar that is still
 * recentring. It swells a little and casts a deeper shadow on the way. With
 * reduced motion it fades out where the tool was.
 */
export function useFlightGhost(flight: ToolbarFlight, values: GhostValues, elements: GhostElements, onLanded: (serial: number) => void): void {
  useLayoutEffect(() => {
    const { x, y, width, height, scale, opacity, trayLook, shadow } = values
    // The ghost layer's parent is the bottom toolbar row.
    const row = elements.ghost.current?.parentElement?.parentElement
    const takeOff = row ? flightEnd(row, flight.id, flight.from) : null
    if (!row || !takeOff) {
      onLanded(flight.serial)
      return undefined
    }
    const toTray = flight.from === 'bar'
    const place = (box: GhostBox): void => {
      x.set(box.x)
      y.set(box.y)
      width.set(box.width)
      height.set(box.height)
    }
    const start = drawnBox(row, takeOff)
    place(start)
    trayLook.set(toTray ? 0 : 1)

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
      }
    }

    const progress = motionValue(0)
    const stopFollowing = progress.on('change', (p) => {
      const target = flightEnd(row, flight.id, toTray ? 'tray' : 'bar')
      place(target ? lerpBox(start, laidOutBox(row, target), p) : start)
      trayLook.set(toTray ? p : 1 - p)
      shadow.set(Math.sin(Math.PI * p))
    })
    const travel = animate(progress, 1, FLIGHT)
    const swell = animate(scale, FLIGHT_SCALE.keyframes, FLIGHT_SCALE.transition)
    void travel.then(land)
    return () => {
      live = false
      travel.stop()
      swell.stop()
      stopFollowing()
    }
  }, [flight, values, elements, onLanded])
}
