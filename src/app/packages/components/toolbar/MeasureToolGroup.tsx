import { t } from '../../../i18n';
import React, { useState } from "react"
import { Circle, Ruler, Triangle } from "lucide-react"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { MEASURE_SHAPES, measureToolFace, type MeasureTool } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

const SHAPE_OPTIONS: readonly { tool: MeasureTool; icon: typeof Ruler; label: string }[] = [
  { tool: "measure", icon: Ruler, label: t('toolbar.line') },
  { tool: "measure-circle", icon: Circle, label: t('toolbar.circle') },
  { tool: "measure-cone", icon: Triangle, label: t('toolbar.cone') },
]

/** Line, circle and cone measurements, and whether they stay on the map. */
export function MeasureToolGroup({ activeTool, selectTool, menuOpen, toggleMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const emit = useEmitViewEvent()
  const [persist, setPersist] = useState(false)
  const face = measureToolFace(activeTool)

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('measure')}
      menuLabel={t('toolbar.measureOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        {SHAPE_OPTIONS.map(({ tool, icon, label }) => (
          <DropdownMenuItem
            key={tool}
            icon={icon}
            label={label}
            isActive={activeTool === tool}
            onClick={() => {
              emit('measure-shape-changed', MEASURE_SHAPES[tool]);
              selectTool(tool);
            }}
          />
        ))}
      </div>

      <div className="atlas-dropdown-separator"></div>

      <div className="atlas-dropdown-section">
        <DropdownToggleRow
          label={t('toolbar.persist')}
          value={persist}
          onChange={() => {
            const next = !persist;
            setPersist(next);
            emit('measure-persistence-changed', next);
          }}
        />
      </div>
    </ToolGroup>
  )
}
