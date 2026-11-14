import type React from "react"
import type { DiceTool } from "../../../tools/DiceTool"
import type { MapHotkeyId } from "../../../keyboard/mapHotkeys"
import type { MeasureMode } from "../../../measure/measureTypes"
import type { Tool } from "./toolFaces"
import type { ToolGroupControls } from "./ToolGroup"

/** Tool groups whose options menu is open; only one at a time. */
export type ToolMenu = 'move' | 'fog' | 'draw' | 'text' | 'measure' | 'wall' | 'pin'

/**
 * What MainToolbar hands every control's item builder. Gates (player view,
 * build flags) live in the catalog and are applied before a builder is asked.
 */
export interface ToolbarContext {
  activeTool: Tool
  /** The mode the measure tool measures in: its button shows it. */
  measureMode: MeasureMode
  selectTool: (tool: Tool) => void
  hotkeyLabel: (id: MapHotkeyId) => string
  openMenu: ToolMenu | null
  groupControls: (menu: ToolMenu) => ToolGroupControls
  dice: { open: boolean; toggle: () => void; tool: DiceTool | null; buttonRef: React.RefObject<HTMLDivElement | null> }
  loot: { open: boolean; setOpen: (open: boolean) => void }
  assets: { open: boolean; toggle: () => void }
  palette: { open: boolean; setOpen: (open: boolean) => void }
}
