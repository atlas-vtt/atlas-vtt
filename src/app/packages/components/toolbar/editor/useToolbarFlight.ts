import { useCallback, useRef, useState } from 'react'
import { MotionGlobalConfig, useReducedMotion } from 'framer-motion'
import type { ToolbarControlId } from '../../../../toolbar/toolbarCatalog'

/** A tool on its way between the bar and the tray after Hide, Show on toolbar, Delete or Enter. */
export interface ToolbarFlight {
  id: ToolbarControlId
  /** Where it took off: the bar (or "More tools") when hidden, the tray when shown. */
  from: 'bar' | 'tray'
  /** It flies to its new place; with reduced motion it only fades out where it was. */
  travel: boolean
  serial: number
}

export interface ToolbarFlights {
  flight: ToolbarFlight | null
  /** Starts a flight, which ends the one in the air. None while Motion's animations are skipped. */
  launch: (id: ToolbarControlId, from: ToolbarFlight['from']) => void
  /** The flight with this serial arrived; a later one stays. */
  land: (serial: number) => void
  cancel: () => void
}

/** The flight of the toolbar editor's last Hide or Show, one at a time. */
export function useToolbarFlight(): ToolbarFlights {
  const [flight, setFlight] = useState<ToolbarFlight | null>(null)
  const serial = useRef(0)
  const reduced = useReducedMotion() === true

  const launch = useCallback((id: ToolbarControlId, from: ToolbarFlight['from']): void => {
    if (MotionGlobalConfig.skipAnimations) return
    serial.current += 1
    setFlight({ id, from, travel: !reduced, serial: serial.current })
  }, [reduced])

  const land = useCallback((landed: number): void => {
    setFlight(current => (current?.serial === landed ? null : current))
  }, [])

  const cancel = useCallback((): void => setFlight(null), [])

  return { flight, launch, land, cancel }
}
