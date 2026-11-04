import { t } from '../../../i18n';
import React from "react"
import { Flashlight, Hand } from "lucide-react"
import { useAtlasStore } from "src/app/react/ViewStoreContext"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { LaserPointerOptions } from "../LaserPointerOptions"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { moveToolFace } from "./toolFaces"

/** Move/Select and the laser pointer, with the selection mode and laser options. */
export function MoveToolGroup({ activeTool, selectTool, menuOpen, toggleMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const selectionMode = useAtlasStore(state => state.selectionMode)
  const setSelectionMode = useAtlasStore(state => state.setSelectionMode)
  const face = moveToolFace(activeTool)

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('move')}
      menuLabel={t('toolbar.moveOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          icon={Hand}
          label={t('toolbar.moveSelect')}
          shortcut={hotkeyLabel('move')}
          isActive={activeTool === "move"}
          onClick={() => selectTool("move")}
        />
        <DropdownMenuItem
          icon={Flashlight}
          label={t('toolbar.laser')}
          shortcut={hotkeyLabel('move')}
          isActive={activeTool === "laser-pointer"}
          onClick={() => selectTool("laser-pointer")}
        />
      </div>

      <div className="atlas-dropdown-section">
        <DropdownToggleRow
          label={t('toolbar.lassoSelection')}
          value={selectionMode === 'lasso'}
          onChange={() => setSelectionMode(selectionMode === 'box' ? 'lasso' : 'box')}
        />
      </div>

      <LaserPointerOptions />
    </ToolGroup>
  )
}
