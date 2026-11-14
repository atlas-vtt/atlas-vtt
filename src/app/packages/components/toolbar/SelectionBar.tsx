import React, { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { t } from "../../../i18n"
import { SELECTION_BAR } from "../../../pixi/annotations/BarMenuPress"
import { useViewStoreHook } from "../../../react/ViewStoreContext"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { useAnchoredPopoverVariants } from "../primitives/dialogMotion"
import { TooltipProvider } from "../primitives/tooltip"
import { BarSideProvider } from "./barSide"
import { DrawModeTool } from "./DrawModeTools"
import type { DrawToolId } from "./drawToolChoices"
import { selectionBarTools } from "./selectionBarTools"
import { GroupBreak } from "./ToolOptionsBar"
import { useDrawStyle } from "./useDrawStyle"
import { useSelectionBarPlace } from "./useSelectionBarPlace"

/**
 * The bar under the drawings and texts selected with the move or select tool: their colour, size
 * and what only their kind has, their order, who sees them, where they lie, their lock and Delete
 * (`selectionBarTools`), as the context menu has most of them too. It grows out from under the
 * selection when the frame appears and goes when it does: with another tool, while the selection
 * is dragged, while a text is typed, in the session view and while the toolbar is arranged.
 */
export function SelectionBarHost(): React.ReactElement {
  const shown = useSelectionBarShown()
  return (
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>{shown && <SelectionBar key="selection-bar" />}</AnimatePresence>
    </TooltipProvider>
  )
}

/** Whether the canvas shows a frame the bar stands under, looked at on the map's own frame clock (`barFrame`). */
function useSelectionBarShown(): boolean {
  const { renderer, pixiApp } = useAtlasUI()
  const store = useViewStoreHook()
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const look = (): void => {
      const state = store.getState()
      setShown(state.isGMView && !state.isPlayerView && !state.isToolbarEditing && !state.isMapLoading && (renderer?.getAnnotations()?.barFrame() ?? null) !== null)
    }
    look()
    const ticker = pixiApp?.ticker
    ticker?.add(look)
    return () => {
      // A view that closes destroys its PIXI app, and with it this ticker, before the UI unmounts.
      if (ticker && pixiApp?.ticker === ticker) ticker.remove(look)
    }
  }, [renderer, pixiApp, store])
  return shown
}

function SelectionBar(): React.ReactElement {
  const { renderer } = useAtlasUI()
  const ref = useRef<HTMLDivElement>(null)
  const frame = useCallback(() => renderer?.getAnnotations()?.barFrame() ?? null, [renderer])
  const side = useSelectionBarPlace(ref, frame)
  const access = useDrawStyle()
  const variants = useAnchoredPopoverVariants()
  // While it leaves, nothing may be selected any more: the bar keeps the tools it had.
  const kept = useRef<readonly (readonly DrawToolId[])[]>([])
  const tools = selectionBarTools(access.selected)
  if (tools.length > 0) kept.current = tools
  return (
    <motion.div
      ref={ref}
      role="toolbar"
      aria-label={t('draw.selectionBar')}
      className={`atlas-tool-bar ${SELECTION_BAR}`}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <BarSideProvider value={side}>
        {kept.current.map((group, index) => (
          <React.Fragment key={group.join(' ')}>
            {index > 0 && <GroupBreak />}
            {group.map((id) => <DrawModeTool key={id} id={id} access={access} locked={null} selectionOnly />)}
          </React.Fragment>
        ))}
      </BarSideProvider>
    </motion.div>
  )
}
