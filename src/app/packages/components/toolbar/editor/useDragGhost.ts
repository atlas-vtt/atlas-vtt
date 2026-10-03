import { useLayoutEffect, useRef } from 'react'
import { MOTION_FAST_MS } from '../../../../utils/motion'
import { DragGhostMotion } from './dragGhostMotion'
import { motionModeOf, REFUSAL_TINT_MS, RETURN, SETTLE } from './editorMotion'
import type { GhostElements, GhostValues } from './ToolbarDragGhost'
import { useToolbarEditState, type ToolbarDrag, type ToolbarEditStore, type ToolbarGhostTicket, type ToolbarPlace } from './toolbarEditStore'
import { flightEnd, laidOutBox, pickupBox, type GhostBox } from './toolbarGhostGeometry'

function sizeOf(face: HTMLElement | null): { width: number; height: number } {
  return { width: face?.offsetWidth ?? 0, height: face?.offsetHeight ?? 0 }
}

function clampShare(share: number): number {
  return Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0.5
}

/** The face a drag's ghost shows: that of the zone it is over; outside both (or refused), the last one's. */
function lookOf(drag: ToolbarDrag, previous: ToolbarPlace): ToolbarPlace {
  if (drag.zone === 'tray' && !drag.refused) return 'tray'
  return drag.zone === 'bar' ? 'bar' : previous
}

/**
 * Drives the ghost of a pointer drag. At pickup it stands exactly over the
 * control, at the scale the press left it at, measures the tool's width in
 * the bar on its own face (the bar's well takes it), and lifts. It then
 * follows the pointer and the drag's zone. Once the drag ends it settles onto
 * the control the drop put in place, or goes back where it came from,
 * shaking first if the tray refused it; with reduced motion it goes at once
 * and the control fades in. A new press lands it at once (`landNow`).
 */
export function useDragGhost(ticket: ToolbarGhostTicket, store: ToolbarEditStore, values: GhostValues, elements: GhostElements): void {
  const settle = useToolbarEditState(state => state.settle)
  const motion = useRef<DragGhostMotion | null>(null)
  const row = useRef<Element | null>(null)
  // Removes the ghost and reveals its control; once.
  const landRef = useRef<() => void>(() => undefined)

  useLayoutEffect(() => {
    let landed = false
    const land = (): void => {
      if (landed) return
      landed = true
      store.state.setState(state => (state.ghost?.serial === ticket.serial ? { ghost: null, settle: null } : state))
    }
    landRef.current = land
    const ghost = elements.ghost.current
    // The ghost layer's parent is the bottom toolbar row.
    const container = ghost?.parentElement?.parentElement ?? null
    const origin = container ? flightEnd(container, ticket.id, ticket.from) : null
    if (!ghost || !container || !origin) {
      land()
      return undefined
    }
    row.current = container
    const { box, scale } = pickupBox(container, origin)
    const sizes = { bar: sizeOf(elements.barFace.current), tray: sizeOf(elements.trayFace.current) }
    const grab = {
      x: clampShare((store.pointer.x.get() - box.x) / box.width),
      y: clampShare((store.pointer.y.get() - box.y) / box.height),
    }
    const driver = new DragGhostMotion(values, store.pointer, sizes, motionModeOf(ghost), grab, ticket.from)
    motion.current = driver
    driver.pickUp(box, scale)
    const landNow = (): void => {
      driver.complete()
      land()
    }
    store.landNow = landNow

    let look = ticket.from
    const follow = (drag: ToolbarDrag | null): void => {
      if (!drag || drag.id !== ticket.id) return
      look = lookOf(drag, look)
      driver.setLook(look)
      driver.setLifted(drag.zone !== null && !drag.refused)
    }
    store.state.setState(state => (state.drag?.id === ticket.id && state.drag.barWidth === null
      ? { drag: { ...state.drag, barWidth: sizes.bar.width } }
      : state))
    follow(store.state.getState().drag)
    const unsubscribe = store.state.subscribe(state => follow(state.drag))
    return () => {
      unsubscribe()
      driver.stop()
      motion.current = null
      if (store.landNow === landNow) store.landNow = null
    }
  }, [ticket, store, values, elements])

  useLayoutEffect(() => {
    const driver = motion.current
    const container = row.current
    const ghost = elements.ghost.current
    if (!settle || settle.id !== ticket.id) return undefined
    if (!driver || !container || !ghost) {
      landRef.current()
      return undefined
    }
    let live = true
    const land = (): void => {
      if (live) landRef.current()
    }
    const target = (): GhostBox | null => {
      const slot = flightEnd(container, settle.id, settle.to)
      return slot && laidOutBox(container, slot)
    }
    const mode = motionModeOf(ghost)
    const run = async (): Promise<void> => {
      if (mode === 'skip') return
      if (!settle.travel) {
        // Reduced motion: the ghost goes at once (after the refusal's tint), the control fades in.
        if (settle.refused) {
          ghost.dataset.refused = ''
          await new Promise(resolve => ghost.win.setTimeout(resolve, REFUSAL_TINT_MS))
        }
        values.opacity.jump(0)
        await new Promise(resolve => ghost.win.setTimeout(resolve, MOTION_FAST_MS))
        return
      }
      if (settle.refused) await driver.shake()
      // A new press landed the ghost during the shake: its values belong to the next drag now.
      if (!live) return
      await driver.settle(target, settle.to, settle.kind === 'drop' ? SETTLE : RETURN)
    }
    void run().then(land)
    return () => {
      live = false
    }
  }, [settle, ticket, values, elements])
}
