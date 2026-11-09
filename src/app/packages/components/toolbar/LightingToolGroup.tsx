import React, { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDownToDot, BrickWall, Flame, FlameKindling, Footprints, Lamp, Lightbulb, Moon, MousePointer2, Pencil, Pickaxe, Sparkles, SunMoon } from "lucide-react"
import { t } from '../../../i18n';
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { chosenLightPreset } from "../../../lighting/lightPresetChoice"
import { exploredMemoryEditable } from "../../../lighting/sceneLightingOptions"
import { hasLevels } from "../../../levels/sceneLevels"
import { useMapLightPresets } from "../../../react/hooks/useMapLightPresets"
import type { LightKind } from "../../../types/lightingTypes"
import type { WallToolMode, WallToolSubMode } from "../../../tools/WallTool"
import { DropdownMenuItem, type DropdownMenuItemProps } from "../primitives/DropdownMenuItem"
import { SegmentedControl, type SegmentedOption } from "../primitives/SegmentedControl"
import { ExploredMemorySection } from "./ExploredMemorySection"
import { RoomsSection } from "./RoomsSection"
import { SceneLightingSection } from "./SceneLightingSection"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { lightingToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

type RowIcon = DropdownMenuItemProps['icon']

/** What the tool does with a click: a short name on its tile, the full one for its tooltip. */
const SUB_MODES: readonly { value: WallToolSubMode; icon: RowIcon; label: string; name: string }[] = [
  { value: 'draw', icon: BrickWall, label: t('toolbar.modeWalls'), name: t('toolbar.drawWalls') },
  { value: 'rooms', icon: Pickaxe, label: t('rooms.mode'), name: t('rooms.mode') },
  { value: 'place-light', icon: Lightbulb, label: t('toolbar.modeLights'), name: t('toolbar.placeLights') },
  { value: 'light-zone', icon: SunMoon, label: t('toolbar.modeZones'), name: t('sceneLight.mode.zones') },
  { value: 'level-surface', icon: ArrowDownToDot, label: t('openings.mode'), name: t('openings.mode') },
  { value: 'explored-memory', icon: Footprints, label: t('toolbar.modeMemory'), name: t('sceneLight.mode.memory') },
]

const DRAW_MODES: readonly SegmentedOption<WallToolMode>[] = [
  { value: 'point-to-point', icon: <MousePointer2 />, label: t('toolbar.pointToPoint') },
  { value: 'freeform', icon: <Pencil />, label: t('toolbar.freehand') },
]

/** A row's icon for each kind of light a preset can be. */
const KIND_ICONS: Record<LightKind, RowIcon> = {
  candle: Flame,
  torch: FlameKindling,
  lantern: Lamp,
  magical: Sparkles,
  darkness: Moon,
  custom: Lightbulb,
}

/** Walls, lights and the scene's lighting in one place. DM only. */
export function LightingToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const emit = useEmitViewEvent()
  const lighting = useAtlasStore((state) => state.lighting)
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting)
  const setSceneLightingPanelOpen = useAtlasStore((state) => state.setSceneLightingPanelOpen)
  const setRoomsMode = useAtlasStore((state) => state.setRoomsMode)
  const [subMode, setSubModeState] = useState<WallToolSubMode>('draw')
  // The Rooms panel shows while the tool works in the Rooms mode, so the mode is the store's to know too
  const setSubMode = useCallback((value: WallToolSubMode): void => {
    setSubModeState(value)
    setRoomsMode(value === 'rooms')
    emit('wall-submode-changed', value)
  }, [setRoomsMode, emit])
  const [drawMode, setDrawMode] = useState<WallToolMode>('point-to-point')
  const presets = useMapLightPresets()
  // The chosen preset's id; the collection's torch until one is chosen, and again once the collection no longer has it.
  const [presetId, setPresetId] = useState<string | null>(null)
  const preset = chosenLightPreset(presets, presetId)
  // The explored-memory mode's choices are the tool's own, in the view's store: a menu mounted anew shows them as they are.
  const brush = useAtlasStore((state) => state.exploredBrush)
  const setBrush = useAtlasStore((state) => state.setExploredBrush)
  const roomTool = useAtlasStore((state) => state.roomTool)
  const setRoomTool = useAtlasStore((state) => state.setRoomTool)
  // What the tool does with a click is this menu's to say: a menu mounted anew starts with drawing walls, and so does the tool.
  const mounted = useRef(false)
  useEffect(() => {
    if (mounted.current) return
    mounted.current = true
    setSubMode('draw')
  }, [setSubMode])
  const face = lightingToolFace(activeTool)
  // Explored memory is edited only on a lit scene that remembers: without one the mode's row is disabled, and the tool leaves it.
  const memoryEditable = exploredMemoryEditable(lighting)
  useEffect(() => {
    if (memoryEditable || subMode !== 'explored-memory') return
    setSubMode('draw')
  }, [memoryEditable, subMode, setSubMode])
  // Openings look down to another level: in a scene of one level the row is disabled, and the tool leaves the mode.
  const levelled = useAtlasStore((state) => hasLevels(state.levels))
  useEffect(() => {
    if (levelled || subMode !== 'level-surface') return
    setSubMode('draw')
  }, [levelled, subMode, setSubMode])

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('wall')}
      menuLabel={t('toolbar.lightingOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <SegmentedControl<WallToolSubMode>
          className="atlas-segmented--tiles"
          roving
          value={subMode}
          ariaLabel={t('toolbar.lightingOptions')}
          options={SUB_MODES.map(({ value, icon: Icon, label, name }) => {
            const disabled = (value === 'explored-memory' && !memoryEditable) || (value === 'level-surface' && !levelled)
            const why = value === 'level-surface' ? t('openings.needsLevels') : t('sceneLight.memoryNeeded')
            return { value, label, icon: <Icon />, ...(disabled ? { disabled: true, hint: why } : { hint: name }) }
          })}
          onChange={(value) => {
            setSubMode(value)
            selectTool('wall')
          }}
        />
      </div>

      {subMode === 'explored-memory' && (
        <ExploredMemorySection options={brush} onChange={setBrush} />
      )}

      {subMode === 'rooms' && <RoomsSection options={roomTool} onChange={setRoomTool} />}

      {subMode === 'draw' && (
        <div className="atlas-dropdown-section">
          <SegmentedControl<WallToolMode>
            value={drawMode}
            options={DRAW_MODES}
            ariaLabel={t('toolbar.drawWalls')}
            onChange={(value) => {
              setDrawMode(value)
              emit('wall-mode-changed', value)
            }}
          />
        </div>
      )}

      {/* The zone mode has no choices of its own: a zone is drawn corner by corner. */}
      {subMode === 'place-light' && <div className="atlas-dropdown-section">
        {presets.map(({ id, name, kind }) => (
          <DropdownMenuItem
            key={id}
            icon={KIND_ICONS[kind]}
            label={name}
            isActive={id === preset.id}
            onClick={() => {
              setPresetId(id)
              emit('lighting-preset-changed', id)
            }}
          />
        ))}
      </div>}

      <SceneLightingSection
        lighting={lighting}
        onChange={setSceneLighting}
        {...(subMode === 'explored-memory' && {
          onRevealExplored: (): void => {
            emit('lighting-reveal-explored')
            closeMenu()
          },
        })}
        onOpenSettings={() => {
          setSceneLightingPanelOpen(true)
          closeMenu()
        }}
      />
    </ToolGroup>
  )
}
