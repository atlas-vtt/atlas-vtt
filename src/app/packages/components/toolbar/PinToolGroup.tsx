import React from "react"
import { MapPin } from "lucide-react"
import { t } from '../../../i18n'
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { hexLayoutOfGrid } from "../../../grid/hexLinks"
import { squareGridOf } from "../../../grid/squareLattice"
import { hasLevels } from "../../../levels/sceneLevels"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { StairsIcon } from "../../../react/components/StairsIcon"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { LabelTooltip } from "../primitives/tooltip"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { pinToolFace } from "./toolFaces"
import { ToolSwitchRow } from "./ToolSwitchRow"

/**
 * Note pins and stairs: both lead somewhere else from a spot on the map, a pin to a note or a
 * scene, stairs to another level of this scene. DM only. Stairs need a scene of several levels; in
 * any other the row stays where it is, disabled, and says why. The switch under them is what Shift
 * and Alt are to a keyboard: a pin goes to its cell (on a hex grid the note is linked to the hex),
 * and stairs' corners land on wall ends.
 */
export function PinToolGroup({ activeTool, selectTool, menuOpen, toggleMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const levelled = useAtlasStore((state) => hasLevels(state.levels))
  const face = pinToolFace(activeTool)
  // The cells the tool itself reads (`NotePinPreview`): a hex links its note, a square only centres the pin.
  const hexes = useAtlasStore((state) => hexLayoutOfGrid(state.grid) !== null)
  const squares = useAtlasStore((state) => squareGridOf(state.grid) !== null)
  const cellSwitch = hexes
    ? <ToolSwitchRow id="pinCell" label={t('toolbar.linkToHex')} />
    : <ToolSwitchRow id="pinCell" label={t('toolbar.snap')} unavailable={squares ? null : t('toolbar.snapNeedsGrid')} />
  const stairs = (
    <DropdownMenuItem
      icon={StairsIcon}
      label={t('toolbar.stairs')}
      isActive={activeTool === "stairs"}
      disabled={!levelled}
      onClick={() => selectTool("stairs")}
    />
  )

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('pin')}
      menuLabel={t('toolbar.pinOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          icon={MapPin}
          label={t('toolbar.notePin')}
          shortcut={hotkeyLabel('pin')}
          isActive={activeTool === "note-pin"}
          onClick={() => selectTool("note-pin")}
        />
        {levelled ? stairs : <LabelTooltip side="right" label={t('toolbar.stairsNeedLevels')}><div>{stairs}</div></LabelTooltip>}
      </div>
      <div className="atlas-dropdown-section">
        {activeTool === "stairs" ? <ToolSwitchRow id="stairsSnap" label={t('toolbar.snap')} /> : cellSwitch}
      </div>
    </ToolGroup>
  )
}
