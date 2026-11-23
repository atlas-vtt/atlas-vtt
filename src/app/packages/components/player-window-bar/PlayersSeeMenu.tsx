import React, { useRef } from "react"
import { useStore } from "zustand"
import { Eye, Gamepad2, Map as MapIcon, MonitorOff } from "lucide-react"
import { usePlayerViewSwitches, type PlayerViewSwitch } from "../../../react/components/command-palette/playerViewSwitches"
import { PlayerWindowService } from "../../../services/PlayerWindowService"
import { setPlayMode } from "../../../services/tableControls"
import { tableControlsStore, type PlayMode } from "../../../stores/tableControlsStore"
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
  /** The player window is open: its own rows (4K, closing it) show. */
  windowOpen: boolean
  /** An online table runs: how online players play, and online play's own switches, show. */
  online: boolean
}

const PLAY_MODES: readonly { readonly mode: PlayMode; readonly icon: typeof MapIcon; readonly label: string }[] = [
  { mode: "table", icon: MapIcon, label: t("playerBar.modeTable") },
  { mode: "remote", icon: Gamepad2, label: t("playerBar.modeRemote") },
]

const row = ({ id, label, value, onToggle }: PlayerViewSwitch): React.ReactElement => (
  <DropdownToggleRow key={id} label={label} value={value} onChange={onToggle} />
)

/**
 * What players see, the switches of the command palette's player view settings in a menu below its
 * button, for the player window and online players alike. While an online table runs it also says how
 * online players play (each on their own map, or their phones as remotes for the shared screen) and
 * holds online play's own switches; while the player window is open, its 4K rendering and closing it
 * as the last row.
 */
export function PlayersSeeMenu({ open, onToggle, settings, windowOpen, online }: PlayersSeeMenuProps): React.ReactElement {
  const switches = usePlayerViewSwitches(settings)
  const playMode = useStore(tableControlsStore, (s) => s.playMode)
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
          {online && (
            <div className="atlas-dropdown-section">
              <span className="atlas-dropdown-label">{t("playerBar.playMode")}</span>
              {PLAY_MODES.map(({ mode, icon, label }) => (
                <DropdownMenuItem key={mode} icon={icon} label={label} isActive={playMode === mode} onClick={() => setPlayMode(mode)} />
              ))}
            </div>
          )}
          <div className="atlas-dropdown-section">
            {switches.shared.map(row)}
            {windowOpen && row(switches.view4k)}
          </div>
          {tokens.length > 0 && <div className="atlas-dropdown-section">{tokens.map(row)}</div>}
          {online && switches.online.length > 0 && <div className="atlas-dropdown-section">{switches.online.map(row)}</div>}
          {windowOpen && (
            <div className="atlas-dropdown-section">
              <DropdownMenuItem
                icon={MonitorOff}
                label={t("playerBar.close")}
                destructive
                onClick={() => PlayerWindowService.getInstance()?.destroy()}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
