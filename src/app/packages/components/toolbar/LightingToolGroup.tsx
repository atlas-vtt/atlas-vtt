import React, { useEffect, useState } from "react"
import { BrickWall, Flame, FlameKindling, Footprints, Lamp, Lightbulb, Moon, MousePointer2, Pencil, Sparkles, SunMoon } from "lucide-react"
import { t } from '../../../i18n';
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { chosenLightPreset } from "../../../lighting/lightPresetChoice"
import { exploredMemoryEditable } from "../../../lighting/sceneLightingOptions"
import { useMapLightPresets } from "../../../react/hooks/useMapLightPresets"
import type { LightKind } from "../../../types/lightingTypes"
import type { WallToolMode, WallToolSubMode } from "../../../tools/WallTool"
import { DropdownMenuItem, type DropdownMenuItemProps } from "../primitives/DropdownMenuItem"
import { ExploredMemorySection } from "./ExploredMemorySection"
import { SceneLightingSection } from "./SceneLightingSection"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { lightingToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

type RowIcon = DropdownMenuItemProps['icon']

/** What the tool does with a click. */
const SUB_MODES: readonly { value: WallToolSubMode; icon: RowIcon; label: string }[] = [
  { value: 'draw', icon: BrickWall, label: t('toolbar.drawWalls') },
  { value: 'place-light', icon: Lightbulb, label: t('toolbar.placeLights') },
  { value: 'light-zone', icon: SunMoon, label: 'Light zones' },
  { value: 'explored-memory', icon: Footprints, label: 'Explored memory' },
]


const DRAW_MODES: readonly { value: WallToolMode; icon: RowIcon; label: string }[] = [
  { value: 'point-to-point', icon: MousePointer2, label: t('toolbar.pointToPoint') },
  { value: 'freeform', icon: Pencil, label: t('toolbar.freehand') },
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
  const [subMode, setSubMode] = useState<WallToolSubMode>('draw')
  const [drawMode, setDrawMode] = useState<WallToolMode>('point-to-point')
  const presets = useMapLightPresets()
  // The chosen preset's id; the collection's torch until one is chosen, and again once the collection no longer has it.
  const [presetId, setPresetId] = useState<string | null>(null)
  const preset = chosenLightPreset(presets, presetId)
  // The explored-memory mode's choices are the tool's own, in the view's store: a menu mounted anew shows them as they are.
  const brush = useAtlasStore((state) => state.exploredBrush)
  const setBrush = useAtlasStore((state) => state.setExploredBrush)
  // What the tool does with a click is this menu's to say: a menu mounted anew starts with drawing walls, and so does the tool.
  useEffect(() => {
    emit('wall-submode-changed', 'draw')
  }, [emit])
  const face = lightingToolFace(activeTool)
  // Explored memory is edited only on a lit scene that remembers: without one the mode's row is disabled, and the tool leaves it.
  const memoryEditable = exploredMemoryEditable(lighting)
  useEffect(() => {
    if (memoryEditable || subMode !== 'explored-memory') return
    setSubMode('draw')
    emit('wall-submode-changed', 'draw')
  }, [memoryEditable, subMode, emit])

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
        {SUB_MODES.map(({ value, icon, label }) => (
          <DropdownMenuItem
            key={value}
            icon={icon}
            label={label}
            // The tool's key selects it with what it did last.
            {...(value === subMode && { shortcut: hotkeyLabel('wall') })}
            isActive={face.isActive && value === subMode}
            disabled={value === 'explored-memory' && !memoryEditable}
            onClick={() => {
              setSubMode(value)
              emit('wall-submode-changed', value)
              selectTool('wall')
            }}
          />
        ))}
      </div>

      {subMode === 'explored-memory' && (
        <ExploredMemorySection options={brush} onChange={setBrush} />
      )}

      {/* The zone mode has no choices of its own: a zone is drawn corner by corner. */}
      {(subMode === 'draw' || subMode === 'place-light') && <div className="atlas-dropdown-section">
        {subMode === 'draw' ? DRAW_MODES.map(({ value, icon, label }) => (
          <DropdownMenuItem
            key={value}
            icon={icon}
            label={label}
            isActive={value === drawMode}
            onClick={() => {
              setDrawMode(value)
              emit('wall-mode-changed', value)
            }}
          />
        )) : presets.map(({ id, name, kind }) => (
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
        onResetExplored={() => {
          emit('lighting-reset-explored')
          closeMenu()
        }}
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
