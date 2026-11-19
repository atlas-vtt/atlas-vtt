import React, { useEffect } from "react"
import { t } from '../../../i18n';
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DEFAULT_LIGHTING_TOOL } from "../../../lighting/lightingTool"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { useUnavailableModes } from "./LightingToolBar"
import { SceneLightingSection } from "./SceneLightingSection"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { lightingToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

/**
 * Walls, lights and the scene's lighting. DM only. The modes and what a click does are the bar
 * above the toolbar (`LightingToolBar`), the light to place among them; the menu holds a brush's
 * size and the scene's lighting.
 */
export function LightingToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const emit = useEmitViewEvent()
  const lighting = useAtlasStore((state) => state.lighting)
  const setSceneLighting = useAtlasStore((state) => state.setSceneLighting)
  const setCommandPaletteOpen = useAtlasStore((state) => state.setCommandPaletteOpen)
  const mode = useAtlasStore((state) => state.lightingTool.mode)
  const setLightingTool = useAtlasStore((state) => state.setLightingTool)
  const brush = useAtlasStore((state) => state.exploredBrush)
  const setBrush = useAtlasStore((state) => state.setExploredBrush)
  const roomTool = useAtlasStore((state) => state.roomTool)
  const setRoomTool = useAtlasStore((state) => state.setRoomTool)
  const face = lightingToolFace(activeTool)
  // A mode that can no longer be chosen (the scene stopped remembering, its last level went) is left for the tool's first.
  const unavailable = useUnavailableModes()
  const modeUnavailable = unavailable(mode) !== null
  useEffect(() => {
    if (modeUnavailable) setLightingTool({ mode: DEFAULT_LIGHTING_TOOL.mode })
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
