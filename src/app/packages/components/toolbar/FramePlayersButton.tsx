import React, { useCallback, useEffect, useRef, useState } from "react"
import { useStore } from "zustand"
import { Scan } from "lucide-react"
import type { AtlasView } from "../../../atlas-view"
import { frameSourceOf, presentTab } from "../../../services/PlayerWindowPresenter"
import { PlayerWindowService } from "../../../services/PlayerWindowService"
import { playerWindowStore } from "../../../stores/playerWindowStore"
import { pickMapPoint } from "../../../pixi/pickMapPoint"
import { PlayerViewFramePreview, type WorldFrame } from "../../../pixi/playerViewFramePreview"
import { ToolButton } from "../primitives/ToolButton"
import { t } from "../../../i18n"

/**
 * Frame player view (GM only, while the player window is open): the next click on the map is the
 * players' new centre, picked with the players' area outlined around the pointer and what they see
 * now of this map dotted. Players are frozen there; a map they do not see yet is presented so.
 */
export function FramePlayersButton({ view }: { view: AtlasView | null }): React.ReactElement | null {
  const isOpen = useStore(playerWindowStore, (s) => s.isOpen)
  const stopPicking = useRef<(() => void) | null>(null)
  const [framing, setFraming] = useState(false)

  const toggleFraming = useCallback((): void => {
    stopPicking.current?.()
    if (framing) return
    const renderer = view?.serviceManager?.getRendererService?.()
    const app = renderer?.getApp()
    const viewport = renderer?.getViewport()
    const orchestrator = renderer?.getRenderer()
    const service = PlayerWindowService.getInstance()
    if (!view || !app || !viewport || !orchestrator || !service) return
    // Sized on this map, which players may not see yet: its grid decides true scale
    const size = service.playerViewWorldSize(frameSourceOf(view))
    const tabId = (): string | null => view.tabMetaStore.getState().activeTabId
    const current = (): WorldFrame | null => {
      const id = tabId()
      return id ? service.playerViewFrame(id) : null
    }
    const preview = size ? new PlayerViewFramePreview(app, viewport, size, (overlay) => orchestrator.addDmScreenOverlay(overlay), current) : null
    setFraming(true)
    stopPicking.current = pickMapPoint(app.canvas, viewport, (x, y) => {
      const id = tabId()
      if (!id || service.framePlayersOn(id, x, y)) return
      // Players see another map: show them this one, already on the point
      const camera = service.playerCameraAt(x, y)
      if (camera) void presentTab(view.app, view, id, { camera })
    }, () => {
      preview?.destroy()
      stopPicking.current = null
      setFraming(false)
    }, preview ? (x, y) => preview.moveTo(x, y) : undefined)
  }, [view, framing])

  useEffect(() => () => stopPicking.current?.(), [])
  useEffect(() => { if (!isOpen) stopPicking.current?.() }, [isOpen])

  if (!isOpen) return null
  return (
    <ToolButton
      icon={Scan}
      label={t('toolbar.framePlayers')}
      {...(framing && { subtitle: t('toolbar.framePlayersPicking') })}
      isActive={framing}
      onClick={toggleFraming}
    />
  )
}
