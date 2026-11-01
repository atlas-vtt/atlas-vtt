import React, { useEffect, useRef, useState } from "react"
import { useStore } from "zustand"
import { Scan } from "lucide-react"
import type { AtlasView } from "../../../atlas-view"
import { useAtlasSettings } from "../../../keyboard/useMapHotkeys"
import { PlayerWindowService } from "../../../services/PlayerWindowService"
import { playerWindowStore } from "../../../stores/playerWindowStore"
import { useKeepInView } from "../primitives/useKeepInView"
import { ToolButton } from "../primitives/ToolButton"
import { TooltipProvider } from "../primitives/tooltip"
import { cn } from "../../../../utils/cn"
import { t } from "../../../i18n"
import { TrueScalePanel } from "./TrueScalePanel"
import "./true-scale.scss"

/**
 * TrueScale (GM only, below the scene tabs while the player window is open): a bar of its own, with
 * the look and corners of the undo/redo bar, whose one button opens the panel for a TV on the table.
 */
export function TrueScaleButton({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const isOpen = useStore(playerWindowStore, (s) => s.isOpen)
  const settings = useAtlasSettings()
  const [panelOpen, setPanelOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const keepInView = useKeepInView(panelRef, panelOpen, "bottom")
  const service = PlayerWindowService.getInstance()

  useEffect(() => {
    if (!isOpen) setPanelOpen(false)
  }, [isOpen])

  // A press anywhere else or Escape closes the panel, before the map hears of the key
  useEffect(() => {
    const root = rootRef.current
    if (!panelOpen || !root) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      if (!root.contains(event.target as Node)) setPanelOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      setPanelOpen(false)
    }
    root.doc.addEventListener("pointerdown", onPointerDown, true)
    root.doc.addEventListener("keydown", onKeyDown, true)
    return () => {
      root.doc.removeEventListener("pointerdown", onPointerDown, true)
      root.doc.removeEventListener("keydown", onKeyDown, true)
    }
  }, [panelOpen])

  if (!isOpen || !settings) return null
  return (
    <TooltipProvider delayDuration={300}>
      <div ref={rootRef} className="atlas-true-scale">
        <div className="atlas-vtt-toolbar">
          <ToolButton
            icon={Scan}
            label={t('tableTv.heading')}
            isActive={panelOpen}
            menuExpanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
            tooltipSide="right"
          />
        </div>
        {panelOpen && (
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t('tableTv.heading')}
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
