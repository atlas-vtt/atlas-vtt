import React, { useEffect } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { DrawMode } from "../../../annotations/annotationTypes"
import { t } from "../../../i18n"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { MOTION_FAST_MS, easeOut } from "../../../utils/motion"
import { TooltipProvider } from "../primitives/tooltip"
import { DrawModeTool } from "./DrawModeTools"
import { DRAW_MODE_CHOICES, drawModeChoice, drawModeTools, drawModeUnavailable } from "./drawToolChoices"
import { ChoiceButtons, GroupBreak, ToolOptionsBars } from "./ToolOptionsBar"
import { useDrawStyle } from "./useDrawStyle"

/** Why the bars take no choice now, or null: drawing is done in the GM's view, and the session view shows the players'. */
function useLockedReason(): string | null {
  const isGMView = useAtlasStore((state) => state.isGMView)
  const hotkeyLabel = useHotkeyLabels()
  return isGMView ? null : t('draw.needsGmView', { key: hotkeyLabel('gmView') })
}

/**
 * The Draw tool's bars above the main toolbar while the tool is chosen: its modes, from the
 * toolbar's left edge, and after them the bar of the mode's tools. What every drawing has
 * (colour, size, players, layer) comes first in every mode that has them, so those four keep
 * their place when the mode changes. With drawings or texts selected the tools show their style
 * and change it; else they show what is drawn next. In the session view the bars stay and take
 * no choice (each button says why). Hidden in the players' view, which has no Draw tool, and
 * while the toolbar is arranged.
 */
export function DrawToolBar(): React.ReactElement {
  const shown = useAtlasStore((state) => state.activeTool === 'draw' && !state.isPlayerView
    && !state.isToolbarEditing && !state.isMapLoading)
  return <ToolOptionsBars shown={shown}><DrawBars /></ToolOptionsBars>
}

function DrawBars(): React.ReactElement {
  const mode = useAtlasStore((state) => state.drawTool.mode)
  const grid = useAtlasStore((state) => state.grid)
  const setDrawTool = useAtlasStore((state) => state.setDrawTool)
  const locked = useLockedReason()
  const choice = drawModeChoice(mode, grid)
  // A mode that cannot be chosen on this map (Cells without a grid) gives way to the one whose button the bar shows for it.
  useEffect(() => {
    if (choice.value !== mode) setDrawTool({ mode: choice.value })
  }, [choice.value, mode, setDrawTool])
  return (
    <TooltipProvider delayDuration={300}>
      <div role="toolbar" aria-label={t('draw.modes')} className="atlas-tool-bar atlas-tool-bar--modes">
        <ChoiceButtons kind="mode" locked={locked} choices={DRAW_MODE_CHOICES} value={choice.value} unavailable={(value) => drawModeUnavailable(value, grid)}
          onChange={(value) => setDrawTool({ mode: value })} />
      </div>
      <ModeTools mode={choice.value} name={choice.label} locked={locked} />
    </TooltipProvider>
  )
}

interface ModeToolsProps {
  mode: DrawMode
  name: string
  locked: string | null
}

/** The bar of the mode's tools: one mode's leave before the next mode's come out of the modes bar's side, which never moves. */
function ModeTools({ mode, name, locked }: ModeToolsProps): React.ReactElement {
  const access = useDrawStyle()
  const groups = drawModeTools(mode)
  const reduced = useReducedMotion()
  const slide = reduced ? 0 : -6
  // Modes with the same tools (rectangle and ellipse) share one bar, which stays as it is between them.
  const tools = groups.map((group) => group.join(' ')).join(' | ')
  return (
    <AnimatePresence mode="wait" initial={false}>
      {groups.length > 0 && (
        <motion.div
          key={tools}
          role="toolbar"
          aria-label={t('toolbar.modeTools', { mode: name })}
          className="atlas-tool-bar atlas-tool-bar--tools"
          initial={{ opacity: 0, x: slide }}
          animate={{ opacity: 1, x: 0, transition: { duration: MOTION_FAST_MS * 1.5 / 1000, ease: easeOut } }}
          exit={{ opacity: 0, transition: { duration: MOTION_FAST_MS / 1000, ease: easeOut } }}
        >
          {groups.map((group, index) => (
            <React.Fragment key={group.join(' ')}>
              {index > 0 && <GroupBreak />}
              {group.map((id) => <DrawModeTool key={id} id={id} access={access} locked={locked} />)}
            </React.Fragment>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
