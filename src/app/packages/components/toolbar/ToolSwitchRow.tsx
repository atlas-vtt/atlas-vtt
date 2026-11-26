import React from "react"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { toolSwitch, type ToolSwitchId } from "../../../types/toolSwitches"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"

interface ToolSwitchRowProps {
  id: ToolSwitchId
  label: string
  /** Why it cannot be switched on this map; the row stays where it is, disabled. */
  unavailable?: string | null
}

/**
 * A row of a tool's menu for one of the switches that stand for a key held during a press
 * (`toolSwitches.ts`): what a finger sets here, a keyboard turns around with the key.
 */
export function ToolSwitchRow({ id, label, unavailable = null }: ToolSwitchRowProps): React.ReactElement {
  const on = useAtlasStore((state) => toolSwitch(state, id))
  const setToolSwitch = useAtlasStore((state) => state.setToolSwitch)
  return (
    <DropdownToggleRow
      label={label}
      value={on && unavailable === null}
      onChange={() => setToolSwitch(id, !on)}
      disabled={unavailable !== null}
      {...(unavailable !== null && { disabledReason: unavailable })}
    />
  )
}
