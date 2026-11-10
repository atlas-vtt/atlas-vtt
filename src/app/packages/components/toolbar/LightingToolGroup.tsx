import React, { useEffect } from "react"
import { Flame, FlameKindling, Lamp, Lightbulb, Moon, Sparkles } from "lucide-react"
import { t } from '../../../i18n';
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { chosenLightPreset } from "../../../lighting/lightPresetChoice"
import { useMapLightPresets } from "../../../react/hooks/useMapLightPresets"
import type { LightKind } from "../../../types/lightingTypes"
import { DropdownMenuItem, type DropdownMenuItemProps } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { useUnavailableModes } from "./LightingToolBar"
import { SceneLightingSection } from "./SceneLightingSection"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { lightingToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

type RowIcon = DropdownMenuItemProps['icon']

/** A row's icon for each kind of light a preset can be. */
const KIND_ICONS: Record<LightKind, RowIcon> = {
  candle: Flame,
  torch: FlameKindling,
  lantern: Lamp,
  magical: Sparkles,
  darkness: Moon,
  custom: Lightbulb,
}

/**
 * Walls, lights and the scene's lighting. DM only. The modes and what a click does are the bar
 * above the toolbar (`LightingToolBar`); the menu holds the current mode's settings (the light to
 * place, a brush's size) and the scene's lighting.
 */
export function LightingToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const emit = useEmitViewEvent()
  const lighting = useAtlasStore((state) => state.lighting)
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting)
  const setCommandPaletteOpen = useAtlasStore((state) => state.setCommandPaletteOpen)
  const { mode, lightPreset } = useAtlasStore((state) => state.lightingTool)
  const setLightingTool = useAtlasStore((state) => state.setLightingTool)
  const presets = useMapLightPresets()
  // The collection's torch until a light is chosen, and again once the collection no longer has it.
  const preset = chosenLightPreset(presets, lightPreset)
  const brush = useAtlasStore((state) => state.exploredBrush)
  const setBrush = useAtlasStore((state) => state.setExploredBrush)
  const roomTool = useAtlasStore((state) => state.roomTool)
  const setRoomTool = useAtlasStore((state) => state.setRoomTool)
  const face = lightingToolFace(activeTool)
  // A mode that can no longer be chosen (the scene stopped remembering, its last level went) is left for walls.
  const unavailable = useUnavailableModes()
  const modeUnavailable = unavailable(mode) !== null
  useEffect(() => {
    if (modeUnavailable) setLightingTool({ mode: 'draw' })
  }, [modeUnavailable, setLightingTool])

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('wall')}
      menuLabel={t('toolbar.lightingOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      {mode === 'place-light' && <div className="atlas-dropdown-section">
        {presets.map(({ id, name, kind }) => (
          <DropdownMenuItem
            key={id}
            icon={KIND_ICONS[kind]}
            label={name}
            isActive={id === preset.id}
            onClick={() => setLightingTool({ lightPreset: id })}
          />
        ))}
      </div>}

      {mode === 'rooms' && roomTool.shape === 'brush' && (
        <div className="atlas-dropdown-section">
          <DropdownSliderRow label={t('rooms.brushSize')} value={roomTool.brushSize} min={10} max={300} disabled={roomTool.action === 'door'}
            onChange={(brushSize) => setRoomTool({ brushSize })} />
        </div>
      )}

      {mode === 'explored-memory' && brush.shape === 'brush' && (
        <div className="atlas-dropdown-section">
          <DropdownSliderRow label={t('sceneLight.memory.brushSize')} value={brush.brushSize} min={10} max={200}
            onChange={(brushSize) => setBrush({ brushSize })} />
        </div>
      )}

      <SceneLightingSection
        lighting={lighting}
        onChange={setSceneLighting}
        {...(mode === 'explored-memory' && {
          onRevealExplored: (): void => {
            emit('lighting-reveal-explored')
            closeMenu()
          },
        })}
        onOpenSettings={() => {
          setCommandPaletteOpen(true, 'lighting-settings')
          closeMenu()
        }}
      />
    </ToolGroup>
  )
}
