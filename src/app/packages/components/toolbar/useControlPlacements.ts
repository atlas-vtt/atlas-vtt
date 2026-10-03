import { useLayoutEffect, useRef } from "react"
import { controlPlacement, nextVisitArmed, type ControlPlacement, type VisitMemory } from "../../../toolbar/toolbarLayout"

interface PlacedControl {
  id: string
  active: boolean
}

/**
 * Where each control shows (`controlPlacement`): in the bar, visiting it while
 * hidden, or hidden. Whether a hidden control may visit depends on how it
 * became active (`nextVisitArmed`), so each control's state is remembered from
 * the last committed render. Reading only committed state keeps the render
 * pure: rendering twice gives the same placements, and a visit appears in the
 * same frame as the change that caused it.
 */
export function useControlPlacements(
  items: readonly PlacedControl[],
  hiddenIds: ReadonlySet<string> | undefined,
  editing: boolean,
): ReadonlyMap<string, ControlPlacement> {
  const committed = useRef<ReadonlyMap<string, VisitMemory>>(new Map())
  const memory = new Map<string, VisitMemory>()
  const placements = new Map<string, ControlPlacement>()
  for (const { id, active } of items) {
    const hidden = hiddenIds?.has(id) ?? false
    const armed = nextVisitArmed(committed.current.get(id), active, hidden, editing)
    memory.set(id, { active, armed })
    placements.set(id, controlPlacement(hidden, active, editing, armed))
  }

  useLayoutEffect(() => {
    committed.current = memory
  })

  return placements
}
