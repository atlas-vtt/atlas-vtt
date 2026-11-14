import { t } from '../../../i18n';
import type React from "react"
import { Cloud, Eraser, Flashlight, Hand, Lightbulb, MapPin } from "lucide-react"
import type { DrawMode } from "../../../annotations/annotationTypes"
import type { MeasureMode } from "../../../measure/measureTypes"
import { StairsIcon } from "../../../react/components/StairsIcon"
import type { ViewAtlasState } from "../../../storeFactory"
import { drawModeChoice } from "./drawToolChoices"
import { measureModeChoice } from "./measureToolChoices"

export type Tool = ViewAtlasState["activeTool"]

/**
 * What a tool family's toolbar button shows and selects: the family member in
 * use, or the family's main tool when another family is active. The bar's
 * button and its entry in the overflow menu both read it.
 */
export interface ToolFace {
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** The tool a click selects. */
  tool: Tool
  isActive: boolean
}

export function moveToolFace(activeTool: Tool): ToolFace {
  const laser = activeTool === "laser-pointer"
  return {
    icon: laser ? Flashlight : Hand,
    label: laser ? t('toolbar.laser') : t('toolbar.moveSelect'),
    tool: laser ? "laser-pointer" : "move",
    isActive: laser || activeTool === "move",
  }
}

export function fogToolFace(activeTool: Tool): ToolFace {
  const eraser = activeTool === "eraser"
  return {
    icon: eraser ? Eraser : Cloud,
    label: eraser ? t('toolbar.fogEraser') : t('toolbar.fogTool'),
    tool: eraser ? "eraser" : "fog",
    isActive: eraser || activeTool === "fog",
  }
}

/** The Draw tool is one tool: its face is the mode a press draws in (`drawTool.mode`, the bar above the toolbar). */
export function drawToolFace(activeTool: Tool, mode: DrawMode): ToolFace {
  const { icon, label } = drawModeChoice(mode)
  return { icon, label, tool: "draw", isActive: activeTool === "draw" }
}

/** The measure tool is one tool: its face is the mode a press measures in (`measureTool.mode`, the bar above the toolbar). */
export function measureToolFace(activeTool: Tool, mode: MeasureMode): ToolFace {
  const { icon, label } = measureModeChoice(mode)
  return { icon, label, tool: "measure", isActive: activeTool === "measure" }
}

/** Face of a tool without family members. */
export function singleToolFace(tool: Tool, icon: ToolFace["icon"], label: string, activeTool: Tool): ToolFace {
  return { icon, label, tool, isActive: activeTool === tool }
}

export function lightingToolFace(activeTool: Tool): ToolFace {
  return singleToolFace("wall", Lightbulb, "Lighting", activeTool)
}

/** Note pins, and the stairs that join a scene's levels: both lead somewhere else from a spot on the map. */
export function pinToolFace(activeTool: Tool): ToolFace {
  if (activeTool === "stairs") return { icon: StairsIcon, label: t('toolbar.stairs'), tool: activeTool, isActive: true }
  return { icon: MapPin, label: t('toolbar.notePin'), tool: "note-pin", isActive: activeTool === "note-pin" }
}
