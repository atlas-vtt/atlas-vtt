import React, { createRef, useLayoutEffect, useMemo, useState, type RefObject } from 'react'
import { motion, useMotionValue, useTransform, type MotionStyle, type MotionValue } from 'framer-motion'
import type { ToolbarEditStore, ToolbarGhostTicket } from './toolbarEditStore'
import { ToolbarFace, type ToolbarFaceItem } from './ToolbarFace'
import { useDragGhost } from './useDragGhost'
import { useFlightGhost } from './useFlightGhost'
import type { ToolbarFlight } from './useToolbarFlight'

/** What moves a ghost: its box in the bottom row's coordinates, its look and its lift. */
export interface GhostValues {
  x: MotionValue<number>
  y: MotionValue<number>
  width: MotionValue<number>
  height: MotionValue<number>
  scale: MotionValue<number>
  opacity: MotionValue<number>
  /** 0: the bar's face, 1: the tray's; between, the two crossfade. */
  trayLook: MotionValue<number>
  /** The deeper shadow of a lifted ghost, 0 to 1. */
  shadow: MotionValue<number>
}

/** The parts of a ghost its driver measures. */
export interface GhostElements {
  ghost: RefObject<HTMLDivElement | null>
  barFace: RefObject<HTMLDivElement | null>
  trayFace: RefObject<HTMLDivElement | null>
}

type GhostItem = ToolbarFaceItem

/** Where a face's first button (the tool's icon) is centred, from the face's left edge. */
function iconCentre(face: HTMLElement | null): number {
  const icon = face?.querySelector<HTMLElement>('.btn')
  return icon ? icon.offsetLeft + icon.offsetWidth / 2 : 0
}

function useGhostElements(): GhostElements {
  const [elements] = useState<GhostElements>(() => ({ ghost: createRef(), barFace: createRef(), trayFace: createRef() }))
  return elements
}

/**
 * A copy of a tool moving between the bar and the tray while the real
 * control waits, invisible, at its new place. It changes its real size
 * between the bar's face and the tray's, crossfading the two with their icons
 * kept on one spot (a tool group's chevron is clipped away as it shrinks).
 * The undo/redo bar's ghost is a whole bar while it shows the bar's face: its
 * corners follow its look (`--atlas-ghost-bar-look`, 1 as a bar).
 */
function GhostView({ values, item, elements }: { values: GhostValues; item: GhostItem; elements: GhostElements }): React.ReactElement {
  const { x, y, width, height, scale, opacity, trayLook, shadow } = values
  const barLook = useTransform(trayLook, (look: number) => 1 - look)
  const barFaceX = useMotionValue(0)
  const trayFaceX = useMotionValue(0)

  useLayoutEffect(() => {
    // Both faces start at the ghost's left edge; sliding them keeps the two icons on one spot.
    const offset = iconCentre(elements.barFace.current) - iconCentre(elements.trayFace.current)
    const align = (look: number): void => {
      barFaceX.set(-offset * look)
      trayFaceX.set(offset * (1 - look))
    }
    align(trayLook.get())
    return trayLook.on('change', align)
  }, [trayLook, elements, barFaceX, trayFaceX])

  const barUnit = item.kind === 'undo-bar'
  const style: MotionStyle = { x, y, width, height, scale, opacity, ...(barUnit && { '--atlas-ghost-bar-look': barLook }) }
  return (
    <motion.div ref={elements.ghost} className="atlas-toolbar-ghost" aria-hidden="true" inert {...(barUnit && { 'data-bar-unit': '' })} style={style}>
      <motion.div className="atlas-toolbar-ghost__shadow" style={{ opacity: shadow }} />
      <div className="atlas-toolbar-ghost__faces">
        <ToolbarFace ref={elements.barFace} item={item} look="bar" style={{ opacity: barLook, x: barFaceX }} />
        <ToolbarFace ref={elements.trayFace} item={item} look="tray" style={{ opacity: trayLook, x: trayFaceX }} />
      </div>
    </motion.div>
  )
}

/** A ghost's values; its box may be given (a drag's, which the drag reads to place a drop). */
function useGhostValues(box: Pick<GhostValues, 'x' | 'y' | 'width' | 'height'> | null): GhostValues {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const width = useMotionValue(0)
  const height = useMotionValue(0)
  const scale = useMotionValue(1)
  const opacity = useMotionValue(1)
  const trayLook = useMotionValue(0)
  const shadow = useMotionValue(0)
  return useMemo(
    () => ({ ...(box ?? { x, y, width, height }), scale, opacity, trayLook, shadow }),
    [box, x, y, width, height, scale, opacity, trayLook, shadow],
  )
}

interface ToolbarFlightGhostProps {
  flight: ToolbarFlight
  item: GhostItem
  onLanded: (serial: number) => void
}

/** The ghost of a Hide or Show flight (`useFlightGhost`). */
export function ToolbarFlightGhost({ flight, item, onLanded }: ToolbarFlightGhostProps): React.ReactElement {
  const values = useGhostValues(null)
  const elements = useGhostElements()
  useFlightGhost(flight, values, elements, onLanded)
  return <GhostView values={values} item={item} elements={elements} />
}

interface ToolbarDragGhostProps {
  ticket: ToolbarGhostTicket
  item: GhostItem
  store: ToolbarEditStore
}

/** The ghost of a pointer drag (`useDragGhost`): it follows the pointer, then settles or goes back. */
export function ToolbarDragGhost({ ticket, item, store }: ToolbarDragGhostProps): React.ReactElement {
  const values = useGhostValues(store.ghost)
  const elements = useGhostElements()
  useDragGhost(ticket, store, values, elements)
  return <GhostView values={values} item={item} elements={elements} />
}
