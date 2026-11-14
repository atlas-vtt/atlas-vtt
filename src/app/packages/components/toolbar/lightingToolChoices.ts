import { ArrowDownToDot, BrickWall, Brush, DoorOpen, Eye, EyeOff, Flame, FlameKindling, Footprints, House, Lamp, Lasso, Lightbulb, Moon, MousePointer2, PaintBucket, PenTool, Pencil, Pickaxe, Sparkles, Square, SunMoon } from "lucide-react"
import { t } from "../../../i18n"
import type { ExploredEditMode } from "../../../lighting/exploredEdits"
import type { WallToolMode, WallToolSubMode } from "../../../lighting/lightingTool"
import type { RoomToolOptions } from "../../../stores/roomsSlice"
import type { StrokeMode } from "../../../tools/shapeStroke"
import type { LightKind } from "../../../types/lightingTypes"
import type { LightPresetDefinition } from "../../../types/lightPresetTypes"
import type { ToolChoice } from "./ToolOptionsBar"

/** What the tool does with a click. Rooms come first: most walls are a room's, and single walls finish them. */
export const LIGHTING_MODES: readonly ToolChoice<WallToolSubMode>[] = [
  { value: 'rooms', icon: House, label: t('toolbar.drawRooms') },
  { value: 'draw', icon: BrickWall, label: t('toolbar.drawWalls') },
  { value: 'place-light', icon: Lightbulb, label: t('toolbar.placeLights') },
  { value: 'light-zone', icon: SunMoon, label: t('sceneLight.mode.zones') },
  { value: 'level-surface', icon: ArrowDownToDot, label: t('openings.mode') },
  { value: 'explored-memory', icon: Footprints, label: t('sceneLight.mode.memory') },
]

/** The icon of each kind of light a preset can be. */
const LIGHT_KIND_ICONS: Record<LightKind, ToolChoice<string>['icon']> = {
  candle: Flame,
  torch: FlameKindling,
  lantern: Lamp,
  magical: Sparkles,
  darkness: Moon,
  custom: Lightbulb,
}

/** The lights of the map's collection as choices of what a click places, each by the icon of its kind and its own name. */
export function lightChoices(presets: readonly LightPresetDefinition[]): ToolChoice<string>[] {
  return presets.map(({ id, name, kind }) => ({ value: id, icon: LIGHT_KIND_ICONS[kind], label: name }))
}

export const DRAW_MODES: readonly ToolChoice<WallToolMode>[] = [
  { value: 'point-to-point', icon: MousePointer2, label: t('toolbar.pointToPoint') },
  { value: 'freeform', icon: Pencil, label: t('toolbar.freehand') },
]

export const ROOM_ACTIONS: readonly ToolChoice<RoomToolOptions['action']>[] = [
  { value: 'carve', icon: Pickaxe, label: t('rooms.carve'), tip: t('rooms.carveTip') },
  { value: 'fill', icon: PaintBucket, label: t('rooms.fill'), tip: t('rooms.fillTip') },
  { value: 'door', icon: DoorOpen, label: t('rooms.door'), tip: t('rooms.doorHint') },
]

export const ROOM_SHAPES: readonly ToolChoice<RoomToolOptions['shape']>[] = [
  { value: 'rectangle', icon: Square, label: t('rooms.rectangle'), tip: t('rooms.rectangleTip') },
  { value: 'polygon', icon: PenTool, label: t('rooms.points'), tip: t('rooms.pointsTip') },
  { value: 'lasso', icon: Lasso, label: t('rooms.lasso') },
  { value: 'brush', icon: Brush, label: t('rooms.brush') },
]

export const MEMORY_ACTIONS: readonly ToolChoice<ExploredEditMode>[] = [
  { value: 'reveal', icon: Eye, label: t('sceneLight.memory.reveal'), tip: t('sceneLight.memory.revealTip') },
  { value: 'forget', icon: EyeOff, label: t('sceneLight.memory.forget'), tip: t('sceneLight.memory.forgetTip') },
]

export const MEMORY_SHAPES: readonly ToolChoice<StrokeMode>[] = [
  { value: 'brush', icon: Brush, label: t('sceneLight.memory.brush') },
  { value: 'lasso', icon: Lasso, label: t('sceneLight.memory.lasso') },
  { value: 'rectangle', icon: Square, label: t('sceneLight.memory.rectangle') },
]
