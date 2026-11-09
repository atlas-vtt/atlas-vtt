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

/** The current mode's own choices, each group after a break. */
function ModeChoices({ mode }: { mode: WallToolSubMode }): React.ReactElement | null {
  const drawMode = useAtlasStore((state) => state.lightingTool.drawMode)
  const setLightingTool = useAtlasStore((state) => state.setLightingTool)
  const roomTool = useAtlasStore((state) => state.roomTool)
  const setRoomTool = useAtlasStore((state) => state.setRoomTool)
  const brush = useAtlasStore((state) => state.exploredBrush)
  const setBrush = useAtlasStore((state) => state.setExploredBrush)

  if (mode === 'draw') return (
    <><GroupBreak /><ChoiceButtons kind="choice" choices={DRAW_MODES} value={drawMode} onChange={(value) => setLightingTool({ drawMode: value })} /></>
  )
  if (mode === 'rooms') {
    // A door is dragged across an opening and has no shape: the shapes stay, disabled, so the bar keeps its width.
    const door = roomTool.action === 'door'
    return (
      <>
        <GroupBreak />
        <ChoiceButtons kind="choice" choices={ROOM_ACTIONS} value={roomTool.action} onChange={(action) => setRoomTool({ action })} />
        <GroupBreak />
        <ChoiceButtons kind="choice" choices={ROOM_SHAPES} value={roomTool.shape} onChange={(shape) => setRoomTool({ shape })}
          unavailable={() => (door ? t('rooms.doorHint') : null)} />
      </>
    )
  }
  if (mode === 'explored-memory') return (
    <>
      <GroupBreak />
      <ChoiceButtons kind="choice" choices={MEMORY_ACTIONS} value={brush.mode} onChange={(value) => setBrush({ mode: value })} />
      <GroupBreak />
      <ChoiceButtons kind="choice" choices={MEMORY_SHAPES} value={brush.shape} onChange={(shape) => setBrush({ shape })} />
    </>
  )
  // Lights, zones and openings: a click places one, and the light to place is in the tool's menu.
  return null
}

/**
 * The lighting tool's bar, centred above the main toolbar while the tool is chosen: its modes, then
 * the current mode's choices. The tool's menu keeps the sizes, the light to place and the scene's
 * lighting. Hidden in the players' view and while the toolbar is arranged.
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
          key="lighting-bar"
          initial={{ opacity: 0, y: rise }}
          animate={{ opacity: 1, y: 0, transition: { duration: PANEL_ENTER_MS / 1000, ease: easeOut } }}
          exit={{ opacity: 0, y: rise / 2, transition: { duration: MOTION_FAST_MS / 1000, ease: easeOut } }}
        >
          <LightingBarContent />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function LightingBarContent(): React.ReactElement {
  const mode = useAtlasStore((state) => state.lightingTool.mode)
  const setLightingTool = useAtlasStore((state) => state.setLightingTool)
  const unavailable = useUnavailableModes()
  return (
    <TooltipProvider delayDuration={300}>
      <div role="toolbar" aria-label={t('toolbar.lightingTools')} className="atlas-vtt-toolbar atlas-lighting-bar">
        <ChoiceButtons kind="mode" choices={LIGHTING_MODES} value={mode} unavailable={unavailable} onChange={(value) => setLightingTool({ mode: value })} />
        <ModeChoices mode={mode} />
      </div>
    </TooltipProvider>
  )
}
