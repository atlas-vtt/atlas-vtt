import { useEffect, useState } from "react"
import { toolSelects } from "../../../annotations/selectMore"
import { portalHost } from "../../../host/portalHost"
import { useAtlasSettings } from "../../../keyboard/useMapHotkeys"
import type { SelectionBarSource } from "../../../pixi/selection/selectionBarSource"
import { useCoarsePointer } from "../../../platform/useCoarsePointer"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import type { ViewAtlasState } from "../../../storeFactory"

/** What stands over the map for what is selected, or over all of it: a context menu, a dialog, the popover of a token's value. */
const COVERING = '.atlas-ctx-menu[data-state="open"], .atlas-modal-overlay, .atlas-token-value-editor'

/** What of a view's state decides whether the bar may show. */
export type BarOfferState = Pick<ViewAtlasState, 'selectedIds' | 'activeTool' | 'isGMView' | 'isPlayerView' | 'isToolbarEditing' | 'isMapLoading'>

/**
 * Whether the view offers the bar a place: something is selected with a tool that selects, in the
 * GM's view of a loaded map (never the players' view or the session view), while the toolbar is
 * not being arranged. `wanted` says the device shows the bar at all.
 */
export function barOffered(state: BarOfferState, wanted: boolean): boolean {
  return wanted && state.selectedIds.length > 0 && toolSelects(state.activeTool)
    && state.isGMView && !state.isPlayerView && !state.isToolbarEditing && !state.isMapLoading
}

/**
 * Whether the bar above a selection shows: under a finger always, under a mouse where the device's
 * setting asks for it; in the GM's view of a loaded map, with a tool that selects, while something
 * selected shows on the canvas. It goes while the selection is dragged, resized or turned, while a
 * marquee is drawn, and while a menu, dialog or value popover stands open (`ownMenu` says the open
 * menu is the bar's own, which keeps it).
 *
 * What the store says is heard from the store. Only while that leaves the bar a place does
 * anything run per frame: one look at whether the selection is being moved.
 */
export function useSelectionActionsShown(source: () => SelectionBarSource | null, ownMenu: boolean): boolean {
  const { pixiApp } = useAtlasUI()
  const coarse = useCoarsePointer()
  const wanted = useAtlasSettings()?.isSelectionBarShown() === true || coarse
  const offered = useAtlasStore((state) => barOffered(state, wanted))
  const [atRest, setAtRest] = useState(false)
  const [covered, setCovered] = useState(false)

  useEffect(() => {
    if (!offered) {
      setAtRest(false)
      return undefined
    }
    const look = (): void => {
      const from = source()
      setAtRest(from !== null && from.shows() && !from.busy())
    }
    look()
    const ticker = pixiApp?.ticker
    ticker?.add(look)
    return () => {
      // A view that closes destroys its PIXI app, and with it this ticker, before the UI unmounts.
      if (ticker && pixiApp?.ticker === ticker) ticker.remove(look)
    }
  }, [offered, source, pixiApp])

  useEffect(() => {
    const doc = pixiApp?.canvas?.ownerDocument
    if (!offered || !doc) {
      setCovered(false)
      return undefined
    }
    const host = portalHost(doc)
    const look = (): void => setCovered(host.querySelector(COVERING) !== null)
    look()
    const observer = new MutationObserver(look)
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] })
    return () => observer.disconnect()
  }, [offered, pixiApp])

  return offered && atRest && (!covered || ownMenu)
}
