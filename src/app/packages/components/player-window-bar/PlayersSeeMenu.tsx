import React, { useId, useRef } from "react"
import { useStore } from "zustand"
import { Eye, Gamepad2, Map as MapIcon, MonitorOff } from "lucide-react"
import { usePlayerViewSwitches, type PlayerViewSwitch, type ResourceAudienceChoice } from "../../../react/components/command-palette/playerViewSwitches"
import { PlayerAudienceControl } from "../../../react/components/command-palette/PlayerAudienceControl"
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
import "./players-see-menu.scss"

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

/** The menu's surface: its options' tooltips stand outside it. */
const MENU = ".atlas-players-see-menu"

const row = ({ id, label, value, onToggle, disabledReason }: PlayerViewSwitch): React.ReactElement => (
  <DropdownToggleRow key={id} label={label} value={value} onChange={onToggle} disabled={disabledReason !== undefined} disabledReason={disabledReason} />
)

/** Below this width (px) the view leaves the menu, a resource's choice stands below its name. */
const STACK_BELOW = 480

/** One resource: its name, and whose tokens players see it on; `stack` puts the choice below the name. */
function AudienceRow({ label, audience, onChange, stack }: ResourceAudienceChoice & { stack: boolean }): React.ReactElement {
  return (
    <div className={cn("atlas-dropdown-choice-row", stack && "atlas-dropdown-choice-row--stack")}>
      <span className="atlas-dropdown-choice-row__label">{label}</span>
      <PlayerAudienceControl name={label} audience={audience} onChange={onChange} tooltipOutside={MENU} />
    </div>
  )
}

/** A group of the menu under its heading, which names it for assistive technology; its parts stand apart below. */
function Group({ heading, children }: { heading: string; children: React.ReactNode }): React.ReactElement {
  const headingId = useId()
  return (
    <section className="atlas-players-see-menu__group" aria-labelledby={headingId}>
      <h3 id={headingId} className="atlas-players-see-menu__heading">{heading}</h3>
      <div className="atlas-players-see-menu__parts">{children}</div>
    </section>
  )
}

/** How online players play: one of two, as a radio group under its label. */
function PlayModes(): React.ReactElement {
  const playMode = useStore(tableControlsStore, (s) => s.playMode)
  const labelId = useId()
  return (
    <div className="atlas-players-see-menu__part atlas-players-see-menu__modes" role="radiogroup" aria-labelledby={labelId}>
      <span id={labelId} className="atlas-dropdown-label atlas-players-see-menu__label">{t("playerBar.playMode")}</span>
      {PLAY_MODES.map(({ mode, icon, label }) => (
        <DropdownMenuItem key={mode} role="radio" icon={icon} label={label} isActive={playMode === mode} onClick={() => setPlayMode(mode)} />
      ))}
    </div>
  )
}

/**
 * What players see, the switches of the command palette's player view settings in a menu below its
 * button. Its columns follow the palette's: what the player window and online players see alike (the
 * widgets, the initiative list, dice rolls, and what the tokens show, each resource on whose tokens), then
 * what belongs to one of them: while the player window is open its own settings (4K, how the initiative
 * list is laid out on the TV) and closing it, and while an online table runs how online players play and
 * online play's own switches. Closing the player window is its end
 * action, in its bottom right corner. Columns stack where the view is narrow.
 */
export function PlayersSeeMenu({ open, onToggle, settings, windowOpen, online }: PlayersSeeMenuProps): React.ReactElement {
  const switches = usePlayerViewSwitches(settings)
  const menuRef = useRef<HTMLDivElement>(null)
  const keepInView = useKeepInView(menuRef, open, "bottom")
  const stack = keepInView.maxWidth !== null && keepInView.maxWidth < STACK_BELOW

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
          className={cn("atlas-dropdown-content atlas-dropdown-content--bottom atlas-players-see-menu", keepInView.capped && "atlas-keep-in-view--capped")}
          style={keepInView.style}
          // Space, Enter and the arrow keys on a control never reach the map's shortcuts
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="atlas-players-see-menu__body">
            <div className="atlas-players-see-menu__column">
              <Group heading={t("lpv.shared")}>
                <div className="atlas-players-see-menu__part">{switches.shared.map(row)}</div>
                <div className="atlas-players-see-menu__part">
                  <span className="atlas-dropdown-label atlas-players-see-menu__label">{t("lpv.tokens")}</span>
                  {switches.tokens.map(row)}
                </div>
                <div className="atlas-players-see-menu__part">
                  <span className="atlas-dropdown-label atlas-players-see-menu__label">{t("lpv.resourcesOn")}</span>
                  {switches.resources.length > 0
                    ? switches.resources.map((choice) => <AudienceRow key={choice.id} {...choice} stack={stack} />)
                    : <p className="atlas-dropdown-hint">{t(switches.hasRules ? "lpv.noResources" : "lpv.noCollection")}</p>}
                </div>
              </Group>
            </div>
            {(windowOpen || online) && (
              <div className="atlas-players-see-menu__column">
                {windowOpen && (
                  <Group heading={t("lpv.playerWindow")}>
                    <div className="atlas-players-see-menu__part">{row(switches.view4k)}</div>
                    <div className="atlas-players-see-menu__part">
                      <span className="atlas-dropdown-label atlas-players-see-menu__label">{t("lpv.initiativePanel")}</span>
                      {switches.initiativeLayout.map(row)}
                      {/* Why its switches are greyed out, where they are; its room kept while they are not */}
                      <p className="atlas-dropdown-hint atlas-players-see-menu__reason" aria-hidden={switches.initiativeLayout[0]?.disabledReason === undefined}>{t("lpv.initiativeOff")}</p>
                    </div>
                  </Group>
                )}
                {online && (
                  <Group heading={t("lpv.online")}>
                    <PlayModes />
                    {switches.online.length > 0 && (
                    <div className="atlas-players-see-menu__part">
                      <span className="atlas-dropdown-label atlas-players-see-menu__label">{t("lpv.duringPlay")}</span>
                      {switches.online.map(row)}
                    </div>
                  )}
                  </Group>
                )}
                {/* The menu's end action, in its bottom right corner */}
                {windowOpen && (
                  <div className="atlas-players-see-menu__close">
                    <DropdownMenuItem
                      icon={MonitorOff}
                      label={t("playerBar.close")}
                      destructive
                      flush
                      onClick={() => PlayerWindowService.getInstance()?.destroy()}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
