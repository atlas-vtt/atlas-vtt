import React, { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { useStore } from "zustand"
import { Blinds, ImageOff, MonitorUp, Pause, Play, RulerDimensionLine } from "lucide-react"
import type { AtlasView } from "../../../atlas-view"
import { useAtlasSettings } from "../../../keyboard/useMapHotkeys"
import { PlayerWindowService } from "../../../services/PlayerWindowService"
import { refreshPlayerWindowDisplay } from "../../../services/playerWindowDisplay"
import { openPlayerWindow } from "../../../services/PlayerWindowPresenter"
import { isDesktopApp } from "../../../platform/desktopOnly"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { runInBackground } from "../../../utils/backgroundTask"
import { playerWindowStore } from "../../../stores/playerWindowStore"
import { tableControlsStore } from "../../../stores/tableControlsStore"
import { isTablePaused, setTableCurtain, toggleTablePause } from "../../../services/tableControls"
import { useKeepInView } from "../primitives/useKeepInView"
import { ToolButton } from "../primitives/ToolButton"
import { TooltipProvider } from "../primitives/tooltip"
import { cn } from "../../../../utils/cn"
import { t } from "../../../i18n"
import { TrueScalePanel } from "../true-scale/TrueScalePanel"
import { FullScreenButton } from "./FullScreenButton"
import { PlayersSeeMenu } from "./PlayersSeeMenu"
import { takeBackHandout, useHandoutShown } from "./playerHandout"
import "../true-scale/true-scale.scss"
import "./player-window-bar.scss"

/** The bar's menus; one is open at a time. */
type BarMenu = "trueScale" | "playersSee"

/** A press anywhere outside `root` or Escape calls `close` while `open`, before the map hears of the key. */
function useDismiss(root: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    const element = root.current
    if (!open || !element) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      if (!element.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      close()
    }
    element.doc.addEventListener("pointerdown", onPointerDown, true)
    element.doc.addEventListener("keydown", onKeyDown, true)
    return () => {
      element.doc.removeEventListener("pointerdown", onPointerDown, true)
      element.doc.removeEventListener("keydown", onKeyDown, true)
    }
  }, [root, open, close])
}

/**
 * The player window bar (GM only, below the scene tabs while the player window is open or an online
 * table runs), with the look and corners of the undo/redo bar. For the player window: TrueScale and
 * full screen on the TV. For everyone at the table: the curtain and pausing play (disabled while
 * TrueScale pins the window and no table runs). While a table runs and the window is closed, opening
 * it for a shared screen. Then what players see (with how online players play while a table runs,
 * and closing the window), and, while players are handed an image or loot,
 * taking it back. The handout's button comes last, so nothing moves under the pointer when it comes or goes.
 */
export function PlayerWindowBar({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const isOpen = useStore(playerWindowStore, (s) => s.isOpen)
  const curtain = useStore(tableControlsStore, (s) => s.curtain)
  const online = useStore(tableControlsStore, (s) => s.online)
  // Read for its changes; what the button shows is `isTablePaused`, which also counts a window frozen another way
  useStore(tableControlsStore, (s) => s.paused)
  useStore(playerWindowStore, (s) => s.isFrozen)
  const handoutShown = useHandoutShown()
  const settings = useAtlasSettings()
  const { app } = useAtlasUI()
  const [menu, setMenu] = useState<BarMenu | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const keepInView = useKeepInView(panelRef, menu === "trueScale", "bottom")
  const service = PlayerWindowService.getInstance()

  // A menu closes with its button: TrueScale's with the player window, what players see with the window and the table
  useEffect(() => {
    setMenu((open) => (open === "trueScale" ? (isOpen ? open : null) : isOpen || online ? open : null))
  }, [isOpen, online])

  const closeMenu = useCallback(() => setMenu(null), [])
  useDismiss(rootRef, menu !== null, closeMenu)

  if ((!isOpen && !online) || !settings) return null
  // TrueScale freezes with the pin on its frame; the button stays, so the bar keeps its shape
  const trueScale = isOpen && (service?.isTrueScale() ?? false)
  const paused = isTablePaused()
  const toggleMenu = (which: BarMenu) => (): void => setMenu((open) => (open === which ? null : which))
  return (
    <TooltipProvider delayDuration={300}>
      {/* A TV plugged in since the window opened goes unnoticed until the screens are read again */}
      <div ref={rootRef} className="atlas-player-window-bar" onPointerEnter={refreshPlayerWindowDisplay}>
        <div className="atlas-vtt-toolbar">
          {/* Online play first: the eye then moves the table, so this is the way to a shared screen beside it. In TrueScale's place, which it takes once open */}
          {!isOpen && isDesktopApp() && (
            <ToolButton
              icon={MonitorUp}
              label={t("lpv.openWindow")}
              subtitle={t("playerBar.openHint")}
              isActive={false}
              onClick={() => runInBackground(openPlayerWindow(app), "Opening the player window")}
              tooltipSide="bottom"
            />
          )}
          {isOpen && (
            <>
              <ToolButton
                icon={RulerDimensionLine}
                label={t("tableTv.heading")}
                isActive={menu === "trueScale"}
                menuExpanded={menu === "trueScale"}
                onClick={toggleMenu("trueScale")}
                tooltipSide="bottom"
              />
              <FullScreenButton />
            </>
          )}
          <ToolButton
            icon={Blinds}
            label={curtain ? t("playerBar.curtainUp") : t("playerBar.curtainDown")}
            isActive={curtain}
            onClick={() => setTableCurtain(!curtain)}
            tooltipSide="bottom"
          />
          <ToolButton
            icon={paused ? Play : Pause}
            label={trueScale && !online ? t("playerBar.freezeTrueScale") : paused ? t("playerBar.unfreeze") : t("playerBar.freeze")}
            {...(online && !paused && { subtitle: t("playerBar.freezeOnline") })}
            isActive={paused}
            disabled={trueScale && !online}
            onClick={toggleTablePause}
            tooltipSide="bottom"
          />
          <PlayersSeeMenu open={menu === "playersSee"} onToggle={toggleMenu("playersSee")} settings={settings} windowOpen={isOpen} online={online} />
          {handoutShown && (
            <ToolButton icon={ImageOff} label={t("playerBar.takeBack")} isActive={false} onClick={takeBackHandout} tooltipSide="bottom" />
          )}
        </div>
        {menu === "trueScale" && (
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("tableTv.heading")}
            className={cn(
              "atlas-dropdown-content atlas-dropdown-content--bottom atlas-dropdown-content--left atlas-true-scale__panel",
              keepInView.capped && "atlas-keep-in-view--capped",
            )}
            style={keepInView.style}
            // Typing and arrow keys here never reach the map's shortcuts
            onKeyDown={(event) => event.stopPropagation()}
          >
            {service && <TrueScalePanel settings={settings} host={service} view={view} />}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
