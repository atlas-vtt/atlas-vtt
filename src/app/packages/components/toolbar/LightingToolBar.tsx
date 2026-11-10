import React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { t } from "../../../i18n"
import { hasLevels } from "../../../levels/sceneLevels"
import type { WallToolSubMode } from "../../../lighting/lightingTool"
import { exploredMemoryEditable } from "../../../lighting/sceneLightingOptions"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { MOTION_FAST_MS, PANEL_ENTER_MS, easeOut } from "../../../utils/motion"
import { ToolButton } from "../primitives/ToolButton"
import { TooltipProvider } from "../primitives/tooltip"
import { DRAW_MODES, LIGHTING_MODES, MEMORY_ACTIONS, MEMORY_SHAPES, ROOM_ACTIONS, ROOM_SHAPES, type LightingChoice } from "./lightingToolChoices"

/** Why a mode cannot be chosen now, or null where it can. */
export function useUnavailableModes(): (mode: WallToolSubMode) => string | null {
  // Explored memory is edited only on a lit scene that remembers; openings look down to another level.
  const memoryEditable = useAtlasStore((state) => exploredMemoryEditable(state.lighting))
  const levelled = useAtlasStore((state) => hasLevels(state.levels))
  return (mode) => {
    if (mode === 'explored-memory' && !memoryEditable) return t('sceneLight.memoryNeeded')
    if (mode === 'level-surface' && !levelled) return t('openings.needsLevels')
    return null
  }
}

interface ChoiceButtonsProps<Value extends string> {
  choices: readonly LightingChoice<Value>[]
  value: Value
  onChange: (value: Value) => void
  /** Why a choice cannot be made now (its tooltip says so), or null. */
  unavailable?: (value: Value) => string | null
  /** A mode is the tool's own choice and shows like a tool; the choices within a mode show lighter. */
  kind: 'mode' | 'choice'
}

function ChoiceButtons<Value extends string>({ choices, value, onChange, unavailable, kind }: ChoiceButtonsProps<Value>): React.ReactElement {
  return (
    <>
      {choices.map((choice) => {
        const why = unavailable?.(choice.value) ?? null
        return (
          <ToolButton
            key={choice.value}
            icon={choice.icon}
            label={choice.label}
            {...((why ?? choice.tip) !== undefined && { subtitle: why ?? choice.tip })}
            isActive={choice.value === value}
            pressed={choice.value === value}
            disabled={why !== null}
            onClick={() => onChange(choice.value)}
            {...(kind === 'choice' && { className: "atlas-lighting-bar__choice" })}
          />
        )
      })}
    </>
  )
}

/** Where the buttons of one group end and the next group's begin: a wider gap, no line. */
function GroupBreak(): React.ReactElement {
  return <span className="atlas-lighting-bar__break" aria-hidden="true" />
}

/** The current mode's tools, in groups; none for a mode where a click only places something. */
function useModeTools(mode: WallToolSubMode): React.ReactElement[] {
  const drawMode = useAtlasStore((state) => state.lightingTool.drawMode)
  const setLightingTool = useAtlasStore((state) => state.setLightingTool)
  const roomTool = useAtlasStore((state) => state.roomTool)
  const setRoomTool = useAtlasStore((state) => state.setRoomTool)
  const brush = useAtlasStore((state) => state.exploredBrush)
  const setBrush = useAtlasStore((state) => state.setExploredBrush)

  if (mode === 'draw') return [
    <ChoiceButtons key="draw" kind="choice" choices={DRAW_MODES} value={drawMode} onChange={(value) => setLightingTool({ drawMode: value })} />,
  ]
  if (mode === 'rooms') return [
    <ChoiceButtons key="action" kind="choice" choices={ROOM_ACTIONS} value={roomTool.action} onChange={(action) => setRoomTool({ action })} />,
    // A door is dragged across an opening and has no shape: the shapes stay, disabled, so the bar keeps its width.
    <ChoiceButtons key="shape" kind="choice" choices={ROOM_SHAPES} value={roomTool.shape} onChange={(shape) => setRoomTool({ shape })}
      unavailable={() => (roomTool.action === 'door' ? t('rooms.doorHint') : null)} />,
  ]
  if (mode === 'explored-memory') return [
    <ChoiceButtons key="action" kind="choice" choices={MEMORY_ACTIONS} value={brush.mode} onChange={(value) => setBrush({ mode: value })} />,
    <ChoiceButtons key="shape" kind="choice" choices={MEMORY_SHAPES} value={brush.shape} onChange={(shape) => setBrush({ shape })} />,
  ]
  // Lights, zones and openings: a click places one, and the light to place is in the tool's menu.
  return []
}

/**
 * The lighting tool's bars above the main toolbar while the tool is chosen, with the toolbar's
 * corners and smaller buttons: its modes, from the toolbar's left edge, and after them a bar of
 * the current mode's tools, which a mode with none leaves out. The modes bar keeps its width, so
 * neither bar moves when the mode changes. The tool's menu keeps the sizes, the
 * light to place and the scene's lighting. Hidden in the players' view and while the toolbar is arranged.
 */
export function LightingToolBar(): React.ReactElement {
  const shown = useAtlasStore((state) => state.activeTool === 'wall' && state.isGMView && !state.isPlayerView
    && !state.isToolbarEditing && !state.isMapLoading)
  const reduced = useReducedMotion()
  const rise = reduced ? 0 : 8
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key="lighting-bars"
          className="atlas-lighting-bars"
          initial={{ opacity: 0, y: rise }}
          animate={{ opacity: 1, y: 0, transition: { duration: PANEL_ENTER_MS / 1000, ease: easeOut } }}
          exit={{ opacity: 0, y: rise / 2, transition: { duration: MOTION_FAST_MS / 1000, ease: easeOut } }}
        >
          <LightingBars />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function LightingBars(): React.ReactElement {
  const mode = useAtlasStore((state) => state.lightingTool.mode)
  const setLightingTool = useAtlasStore((state) => state.setLightingTool)
  const unavailable = useUnavailableModes()
  const tools = useModeTools(mode)
  const reduced = useReducedMotion()
  const slide = reduced ? 0 : -6
  const modeName = LIGHTING_MODES.find((choice) => choice.value === mode)?.label ?? ''
  return (
    <TooltipProvider delayDuration={300}>
      <div role="toolbar" aria-label={t('toolbar.lightingModes')} className="atlas-lighting-bar atlas-lighting-bar--modes">
        <ChoiceButtons kind="mode" choices={LIGHTING_MODES} value={mode} unavailable={unavailable} onChange={(value) => setLightingTool({ mode: value })} />
      </div>
      {/* One mode's tools leave before the next mode's come out of the modes bar's side; the modes bar never moves. */}
      <AnimatePresence mode="wait" initial={false}>
        {tools.length > 0 && (
          <motion.div
            key={mode}
            role="toolbar"
            aria-label={t('toolbar.modeTools', { mode: modeName })}
            className="atlas-lighting-bar atlas-lighting-bar--tools"
            initial={{ opacity: 0, x: slide }}
            animate={{ opacity: 1, x: 0, transition: { duration: MOTION_FAST_MS * 1.5 / 1000, ease: easeOut } }}
            exit={{ opacity: 0, transition: { duration: MOTION_FAST_MS / 1000, ease: easeOut } }}
          >
            {tools.map((group, index) => <React.Fragment key={group.key}>{index > 0 && <GroupBreak />}{group}</React.Fragment>)}
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  )
}
