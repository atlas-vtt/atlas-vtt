import React, { useRef } from "react"
import { useStore } from "zustand"
import { Gamepad2, Map as MapIcon } from "lucide-react"
import { setPlayMode } from "../../../services/tableControls"
import { tableControlsStore, type PlayMode } from "../../../stores/tableControlsStore"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { ToolButton } from "../primitives/ToolButton"
import { useKeepInView } from "../primitives/useKeepInView"
import { cn } from "../../../../utils/cn"
import { t } from "../../../i18n"

interface PlayModeMenuProps {
  open: boolean
  onToggle: () => void
}

interface ModeRow {
  readonly mode: PlayMode
  readonly icon: typeof MapIcon
  readonly label: string
}

const TABLE: ModeRow = { mode: "table", icon: MapIcon, label: t("playerBar.modeTable") }
const MODES: readonly ModeRow[] = [TABLE, { mode: "remote", icon: Gamepad2, label: t("playerBar.modeRemote") }]

/**
 * How online players play, below its button while a table runs: each on their own map, or around the
 * screen everyone watches, each phone a remote for its player's tokens. The button wears the mode's icon.
 */
export function PlayModeMenu({ open, onToggle }: PlayModeMenuProps): React.ReactElement {
  const playMode = useStore(tableControlsStore, (s) => s.playMode)
  const menuRef = useRef<HTMLDivElement>(null)
  const keepInView = useKeepInView(menuRef, open, "bottom")
  const current = MODES.find((entry) => entry.mode === playMode) ?? TABLE

  return (
    <div className="atlas-player-window-bar__menu">
      <ToolButton
        icon={current.icon}
        label={t("playerBar.playMode")}
        subtitle={current.label}
        isActive={open}
        menuExpanded={open}
        onClick={onToggle}
        tooltipSide="bottom"
      />
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("playerBar.playMode")}
          className={cn("atlas-dropdown-content atlas-dropdown-content--bottom", keepInView.capped && "atlas-keep-in-view--capped")}
          style={keepInView.style}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="atlas-dropdown-section">
            {MODES.map(({ mode, icon, label }) => (
              <DropdownMenuItem
                key={mode}
                role="menuitem"
                icon={icon}
                label={label}
                isActive={playMode === mode}
                onClick={() => {
                  setPlayMode(mode)
                  onToggle()
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
