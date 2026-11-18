import { t } from '../../../i18n';
import React from "react"
import { Flashlight, Hand, SquareDashedMousePointer } from "lucide-react"
import { useAtlasStore, useViewStoreHook } from "src/app/react/ViewStoreContext"
import { useAtlasUI } from "src/app/react/root/AtlasUIContext"
import { toolSelects } from "../../../annotations/selectMore"
import { selectAllTokens } from "../../../selection/wholeSelection"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { LaserPointerOptions } from "../LaserPointerOptions"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { moveToolFace } from "./toolFaces"

/** Move/Select and the laser pointer, with how the tool selects (a lasso, Select more), Select all and the laser's options. */
export function MoveToolGroup({ activeTool, selectTool, menuOpen, toggleMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const selectionMode = useAtlasStore(state => state.selectionMode)
  const setSelectionMode = useAtlasStore(state => state.setSelectionMode)
  const selectMore = useAtlasStore(state => state.selectMore)
  const setSelectMore = useAtlasStore(state => state.setSelectMore)
  const store = useViewStoreHook()
  const { renderer } = useAtlasUI()
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
        <DropdownToggleRow
          label={t('selection.selectMore')}
          value={selectMore}
          disabled={!toolSelects(activeTool)}
          onChange={() => setSelectMore(!selectMore)}
        />
      </div>

      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          icon={SquareDashedMousePointer}
          label={t('hotkey.selectAll')}
          shortcut={hotkeyLabel('selectAll')}
          onClick={() => selectAllTokens(store, renderer?.getTokenRenderer())}
        />
      </div>

      <LaserPointerOptions />
    </ToolGroup>
  )
}
