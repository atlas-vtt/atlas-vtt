import React from "react"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { toolSwitch, type ToolSwitchId } from "../../../types/toolSwitches"
import { ToolButton } from "../primitives/ToolButton"
import { TOOL_BAR_CHOICE_CLASS } from "./ToolOptionsBar"

interface ToolSwitchButtonProps {
  id: ToolSwitchId
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** Why it cannot be switched now; the button stays where it is, disabled, and says so. */
  unavailable?: string | null
}

/**
 * A button of a tool's bar for one of the switches that stand for a key held during a press
 * (`toolSwitches.ts`), pressed while the switch is on: for a tool whose menu has no place for a row.
 */
export function ToolSwitchButton({ id, icon, label, unavailable = null }: ToolSwitchButtonProps): React.ReactElement {
  const on = useAtlasStore((state) => toolSwitch(state, id)) && unavailable === null
  const setToolSwitch = useAtlasStore((state) => state.setToolSwitch)
  return (
    <ToolButton
      icon={icon}
      label={label}
      {...(unavailable !== null && { subtitle: unavailable })}
      isActive={on}
      pressed={on}
      disabled={unavailable !== null}
      onClick={() => setToolSwitch(id, !on)}
      className={TOOL_BAR_CHOICE_CLASS}
    />
  )
}
