import React, { useRef } from "react"
import { Eye, MonitorOff } from "lucide-react"
import { usePlayerViewSwitches, type PlayerViewSwitch } from "../../../react/components/command-palette/playerViewSwitches"
import { PlayerWindowService } from "../../../services/PlayerWindowService"
import type { SettingsService } from "../../../services/SettingsService"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { ToolButton } from "../primitives/ToolButton"
import { useKeepInView } from "../primitives/useKeepInView"
import { cn } from "../../../../utils/cn"
import { t } from "../../../i18n"

interface PlayersSeeMenuProps {
  open: boolean
  onToggle: () => void
  settings: SettingsService
}

const row = ({ id, label, value, onToggle }: PlayerViewSwitch): React.ReactElement => (
  <DropdownToggleRow key={id} label={label} value={value} onChange={onToggle} />
)

/**
 * What players see, the switches of the command palette's player view settings in a menu below
 * its button, and closing the player window as its last row.
 */
export function PlayersSeeMenu({ open, onToggle, settings }: PlayersSeeMenuProps): React.ReactElement {
  const switches = usePlayerViewSwitches(settings)
  const menuRef = useRef<HTMLDivElement>(null)
  const keepInView = useKeepInView(menuRef, open, "bottom")
  const tokens = [...switches.resources, ...switches.tokens]

  return (
    <div className="atlas-player-window-bar__menu">
      <ToolButton
        icon={Eye}
        label={t("playerBar.playersSee")}
        isActive={open}
        menuExpanded={open}
        onClick={onToggle}
        tooltipSide="bottom"
      />
      {open && (
        <div
          ref={menuRef}
          role="dialog"
          aria-label={t("playerBar.playersSee")}
          className={cn("atlas-dropdown-content atlas-dropdown-content--bottom", keepInView.capped && "atlas-keep-in-view--capped")}
          style={keepInView.style}
          // Space and Enter on a switch never reach the map's shortcuts
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="atlas-dropdown-section">
            {switches.interface.map(row)}
            {row(switches.view4k)}
          </div>
          {tokens.length > 0 && <div className="atlas-dropdown-section">{tokens.map(row)}</div>}
          <div className="atlas-dropdown-section">
            <DropdownMenuItem
              icon={MonitorOff}
              label={t("playerBar.close")}
              destructive
              onClick={() => PlayerWindowService.getInstance()?.destroy()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
