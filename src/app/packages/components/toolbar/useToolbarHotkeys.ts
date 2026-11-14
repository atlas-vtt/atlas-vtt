import { useEffect, useRef } from "react"
import { useViewStoreHook } from "src/app/react/ViewStoreContext"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"
import { useMapHotkeys } from "../../../keyboard/useMapHotkeys"
import { AMBIENT_AUDIO_ENABLED } from "../../../featureFlags"
import { annotationList } from "../../../annotations/annotationList"
import { DEFAULT_DRAW_TOOL, type DrawMode } from "../../../annotations/annotationTypes"
import { stepDrawSize } from "./drawStyleStore"
import { eraserOrBack, nextDrawMode } from "./drawToolChoices"
import { nextMeasureMode } from "./measureToolChoices"
import type { Tool } from "./toolFaces"
import { levelObjects } from '../../../levels/levelObjects';
import { mapOffersRanges } from "../../../services/mapRanges"
import { mapTokens } from "../../../tokens/offMap"
import { isFogTool, steppedBrushSize } from "../../../fog/fogToolChoices"
import type { ViewAtlasState } from "../../../storeFactory"

const MOVE_TOOLS: readonly Tool[] = ["move", "laser-pointer"]
const FOG_TOOLS: readonly Tool[] = ["fog", "eraser"]

/** The next tool of a family: its first tool when another family is active. */
function cycleTool<T extends Tool>(family: readonly T[], activeTool: Tool): T {
  const index = family.indexOf(activeTool as T)
  return family[(index + 1) % family.length]!
}

/** Steps the fog brush's size, only while the fog tool is in use; `held`: by the finer step of a key held down. */
function stepFogBrush(state: ViewAtlasState, direction: 1 | -1, held: boolean): void {
  if (isFogTool(state.activeTool)) state.setFogTool({ brushSize: steppedBrushSize(state.fogTool.brushSize, direction, held) })
}

interface ToolbarHotkeyActions {
  selectTool: (tool: Tool) => void
  toggleAssetManager: () => void
  closeAssetManager: () => void
  toggleGMView: () => void
  closeMenus: () => void
}

/**
 * The toolbar's map hotkeys; a family's key cycles through its tools, the measure and Draw tools'
 * through their modes. While the Draw tool is in use the eraser's key is its eraser's, and two
 * keys step its size; in the session view, where its bars take no choice, they do nothing.
 */
export function useToolbarHotkeys(viewId: string | undefined, isPlayerView: boolean, actions: ToolbarHotkeyActions): void {
  const store = useViewStoreHook()
  const { app, renderer } = useAtlasUI()
  const { selectTool, toggleAssetManager, closeAssetManager, toggleGMView, closeMenus } = actions
  const activeTool = (): Tool => store.getState().activeTool
  const dmOnly = (action: () => void) => (): void => {
    if (!isPlayerView) action()
  }
  /**
   * The size of the tool in use, a step smaller or larger: the Draw tool's in the GM's view, else
   * the fog brush. A held key goes on sizing the brush; the Draw tool has four named sizes, one a press.
   */
  const stepSize = (direction: 1 | -1) => (event: KeyboardEvent): void => {
    if (isPlayerView) return
    const state = store.getState()
    if (state.activeTool !== "draw") stepFogBrush(state, direction, event.repeat)
    else if (state.isGMView && !event.repeat) stepDrawSize(store, direction)
  }

  // The mode the Draw tool had before its eraser, which the eraser's key goes back to.
  const drawnWith = useRef<DrawMode>(DEFAULT_DRAW_TOOL.mode)
  useEffect(() => {
    const note = (mode: DrawMode): void => {
      if (mode !== "eraser") drawnWith.current = mode
    }
    note(store.getState().drawTool.mode)
    return store.subscribe((state) => note(state.drawTool.mode))
  }, [store])

  useMapHotkeys({
    move: () => selectTool(cycleTool(MOVE_TOOLS, activeTool())),
    fog: dmOnly(() => selectTool(cycleTool(FOG_TOOLS, activeTool()))),
    // The Draw tool in its Text mode; in the session view, where its bars take no choice, the tool keeps its mode.
    text: dmOnly(() => {
      const state = store.getState()
      if (state.isGMView) state.setDrawTool({ mode: "text" })
      selectTool("draw")
    }),
    // The tool keeps its mode while another tool is in use; pressed again while measuring, the key steps to the next mode.
    measure: () => {
      const state = store.getState()
      // Ranges is stepped over where the bar offers it disabled (`useUnavailableMeasureModes`) or not at all.
      const ranges = !isPlayerView && state.isGMView && mapOffersRanges(app, state)
      if (state.activeTool === "measure") state.setMeasureTool({ mode: nextMeasureMode(state.measureTool.mode, ranges) })
      else selectTool("measure")
    },
    measureKeep: dmOnly(() => {
      const state = store.getState()
      if (state.activeTool === "measure") state.setMeasureTool({ keep: !state.measureTool.keep })
    }),
    // The tool keeps its mode while another tool is in use; pressed again while drawing, the key steps to the next mode.
    draw: dmOnly(() => {
      const state = store.getState()
      if (state.activeTool !== "draw") selectTool("draw")
      else if (state.isGMView) state.setDrawTool({ mode: nextDrawMode(state.drawTool.mode, state.grid) })
    }),
    // The Draw tool's eraser while that tool is in use, and from it back to the mode before; else the fog's.
    erase: dmOnly(() => {
      const state = store.getState()
      if (state.activeTool !== "draw") selectTool("eraser")
      else if (state.isGMView) state.setDrawTool({ mode: eraserOrBack(state.drawTool.mode, drawnWith.current, state.grid) })
    }),
    drawSmaller: stepSize(-1),
    drawLarger: stepSize(1),
    gmView: dmOnly(toggleGMView),
    selectAll: dmOnly(() => {
      const state = store.getState()
      // The Draw tool's Select mode selects drawings and texts alone, as its marquee does; in the session view it selects nothing.
      if (state.activeTool === "draw" && state.drawTool.mode === "select") {
        const ids = state.isGMView ? annotationList(levelObjects(state)).map(({ id }) => id) : []
        if (ids.length > 0) state.setSelection(ids)
        return
      }
      // Only what the canvas shows: session view hides tokens, which must not be selected unseen.
      const tokenIds = renderer?.getTokenRenderer()?.visibleTokenIds() ?? Object.keys(mapTokens(levelObjects(store.getState())))
      if (tokenIds.length > 0) store.getState().setSelection(tokenIds)
    }),
    assets: dmOnly(toggleAssetManager),
    pin: dmOnly(() => selectTool("note-pin")),
    wall: dmOnly(() => selectTool("wall")),
    audio: dmOnly(() => { if (AMBIENT_AUDIO_ENABLED) selectTool("audio") }),
    diceTray: () => store.getState().setDiceTrayOpen(!store.getState().isDiceTrayOpen),
    initiative: dmOnly(() => {
      const state = store.getState()
      state.setInitiativeTrackerOpen(!state.initiativeTrackerOpen)
    }),
    lootRoller: dmOnly(() => {
      const state = store.getState()
      state.setLootRollerOpen(!state.lootRoller.open)
    }),
    palette: () => store.getState().setCommandPaletteOpen(!store.getState().isCommandPaletteOpen),
    cancel: () => {
      closeMenus()
      if (store.getState().isAssetManagerOpen) closeAssetManager()
    },
  }, viewId)
}
