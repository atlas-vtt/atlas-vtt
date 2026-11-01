import React, { useRef } from "react"
import { useStore } from "zustand"
import { Bookmark, Pin, PinOff, Play, Tv } from "lucide-react"
import type { AtlasView } from "../../../atlas-view"
import { playerWindowStore } from "../../../stores/playerWindowStore"
import { ToolButton } from "../primitives/ToolButton"
import { TooltipProvider } from "../primitives/tooltip"
import { t } from "../../../i18n"
import { useGlass } from "./useGlass"
import { SavedFrameChip } from "./SavedFrameChip"
import "./glass.scss"

/**
 * The handle of the glass (GM only, while the player window is open): a capsule on the top edge
 * of what players see on this map. Dragging it moves the players, snapped to the grid's cells
 * (Alt frees it); its pin keeps them there or lets them follow the GM, and its bookmark saves the
 * frame on the scene, and is lit while they see a saved frame, which it then takes back. On a map
 * players do not see, it stands on a dimmer ghost of their frame and brings them here. Frames
 * saved on the map have a chip of their own (`SavedFrameChip`).
 */
export function GlassChip({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const isOpen = useStore(playerWindowStore, (state) => state.isOpen)
  if (!isOpen || !view) return null
  return <OpenGlassChip view={view} />
}

function OpenGlassChip({ view }: { view: AtlasView }): React.ReactElement {
  const chipRef = useRef<HTMLDivElement>(null)
  const savedRef = useRef<HTMLDivElement>(null)
  const { shown, togglePin, save, bring, pointerDown, saved } = useGlass(view, chipRef, savedRef)
  const ghost = shown?.look === "ghost"
  const label = ghost ? t("glass.bring") : shown?.pinned ? t("glass.players") : t("glass.following")

  return (
    <TooltipProvider delayDuration={300}>
      <div
        ref={chipRef}
        className="atlas-vtt-toolbar atlas-glass-chip"
        hidden={!shown}
        onPointerDown={pointerDown}
      >
        <Tv className="atlas-glass-chip__icon" aria-hidden="true" />
        <span className="atlas-glass-chip__label">{label}</span>
        {ghost ? (
          <ToolButton icon={Play} label={t("glass.bringHint")} isActive={false} onClick={bring} tooltipSide="bottom" />
        ) : (
          <>
            <ToolButton
              icon={Bookmark}
              label={shown?.saved ? t("glass.unsave") : t("glass.save")}
              isActive={shown?.saved ?? false}
              onClick={save}
              tooltipSide="bottom"
            />
            <ToolButton
              icon={shown?.pinned ? Pin : PinOff}
              label={shown?.pinned ? t("glass.unpin") : t("glass.pin")}
              isActive={shown?.pinned ?? false}
              onClick={togglePin}
              tooltipSide="bottom"
            />
          </>
        )}
      </div>
      <SavedFrameChip ref={savedRef} controls={saved} />
    </TooltipProvider>
  )
}
