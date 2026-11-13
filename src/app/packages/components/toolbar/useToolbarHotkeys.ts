import { useViewStoreHook } from "src/app/react/ViewStoreContext"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"
import { useMapHotkeys } from "../../../keyboard/useMapHotkeys"
import { AMBIENT_AUDIO_ENABLED } from "../../../featureFlags"
import { nextMeasureMode } from "./measureToolChoices"
import type { Tool } from "./toolFaces"
import { levelObjects } from '../../../levels/levelObjects';
import { mapOffersRanges } from "../../../services/mapRanges"
import { mapTokens } from "../../../tokens/offMap"

const MOVE_TOOLS: readonly Tool[] = ["move", "laser-pointer"]
const FOG_TOOLS: readonly Tool[] = ["fog", "eraser"]
const DRAW_TOOLS: readonly Tool[] = ["draw-pen", "draw-icon", "draw-eraser"]

/** The next tool of a family: its first tool when another family is active. */
function cycleTool<T extends Tool>(family: readonly T[], activeTool: Tool): T {
  const index = family.indexOf(activeTool as T)
  return family[(index + 1) % family.length]!
}

interface ToolbarHotkeyActions {
  selectTool: (tool: Tool) => void
  toggleAssetManager: () => void
  closeAssetManager: () => void
  toggleGMView: () => void
  closeMenus: () => void
}

/** The toolbar's map hotkeys; a family's key cycles through its tools, the measure tool's through its modes. */
export function useToolbarHotkeys(viewId: string | undefined, isPlayerView: boolean, actions: ToolbarHotkeyActions): void {
  const store = useViewStoreHook()
  const { app, renderer } = useAtlasUI()
  const { selectTool, toggleAssetManager, closeAssetManager, toggleGMView, closeMenus } = actions
  const activeTool = (): Tool => store.getState().activeTool
  const dmOnly = (action: () => void) => (): void => {
    if (!isPlayerView) action()
  }

  useMapHotkeys({
    move: () => selectTool(cycleTool(MOVE_TOOLS, activeTool())),
    fog: dmOnly(() => selectTool(cycleTool(FOG_TOOLS, activeTool()))),
    text: dmOnly(() => selectTool("text")),
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
    draw: dmOnly(() => selectTool(cycleTool(DRAW_TOOLS, activeTool()))),
    erase: dmOnly(() => selectTool("eraser")),
    gmView: dmOnly(toggleGMView),
    selectAll: dmOnly(() => {
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
