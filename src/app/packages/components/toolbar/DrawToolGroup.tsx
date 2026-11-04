import { t } from '../../../i18n';
import React, { useEffect, useState } from "react"
import {
  Circle, CircleX, DoorClosed, DoorOpen, Eraser, Flame, Footprints, Gem, KeyRound, Lock, Package, Pencil, Skull, Stamp, Swords, Trash2, TriangleAlert,
} from "lucide-react"
import { useAtlasStore } from "src/app/react/ViewStoreContext"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { MAP_ICON_LABELS } from "../../../pixi/mapIcons"
import { LabelTooltip } from "../primitives/tooltip"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownModeSelector } from "../primitives/DropdownModeSelector"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { drawToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"

/** Stampable map icons; keys match `MAP_ICON_SVG` in `pixi/mapIcons.ts`. */
const MAP_ICON_OPTIONS = [
  { key: 'door-open', icon: DoorOpen },
  { key: 'door-closed', icon: DoorClosed },
  { key: 'lock', icon: Lock },
  { key: 'key-round', icon: KeyRound },
  { key: 'triangle-alert', icon: TriangleAlert },
  { key: 'skull', icon: Skull },
  { key: 'flame', icon: Flame },
  { key: 'package', icon: Package },
  { key: 'gem', icon: Gem },
  { key: 'swords', icon: Swords },
  { key: 'footprints', icon: Footprints },
  { key: 'circle-x', icon: CircleX },
] as const;

/** Pen, icon stamp and drawing eraser, with ink, icon and sizes. DM only. */
export function DrawToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const setActiveTool = useAtlasStore(state => state.setActiveTool)
  const emit = useEmitViewEvent()
  const [drawColor, setDrawColor] = useState<'#ffffff' | '#000000'>('#ffffff')
  const [drawWidth, setDrawWidth] = useState(4)
  const [drawIcon, setDrawIcon] = useState<string>('door-open')
  const [eraserWidth, setEraserWidth] = useState(40)
  const face = drawToolFace(activeTool)

  // Keep the drawing renderer in sync with the ink settings
  useEffect(() => {
    emit('drawing-settings-changed', { color: drawColor, width: drawWidth, icon: drawIcon, eraserWidth });
  }, [emit, drawColor, drawWidth, drawIcon, eraserWidth]);

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('draw')}
      menuLabel={t('toolbar.drawOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          icon={Pencil}
          label={t('toolbar.pen')}
          shortcut={hotkeyLabel('draw')}
          isActive={activeTool === "draw-pen"}
          onClick={() => selectTool("draw-pen")}
        />
        <DropdownMenuItem
          icon={Stamp}
          label={t('toolbar.iconStamp')}
          shortcut={hotkeyLabel('draw')}
          isActive={activeTool === "draw-icon"}
          onClick={() => selectTool("draw-icon")}
        />
        <DropdownMenuItem
          icon={Eraser}
          label={t('toolbar.drawingEraser')}
          shortcut={hotkeyLabel('draw')}
          isActive={activeTool === "draw-eraser"}
          onClick={() => selectTool("draw-eraser")}
        />
      </div>

      <div className="atlas-dropdown-section">
        <div className="space-y-2">
          <span className="atlas-dropdown-label">{t('toolbar.icons')}</span>
          <div className="atlas-icon-grid">
            {MAP_ICON_OPTIONS.map(({ key, icon: Icon }) => (
              <LabelTooltip key={key} label={MAP_ICON_LABELS[key] ?? key}>
                <button
                  type="button"
                  aria-pressed={activeTool === "draw-icon" && drawIcon === key}
                  className={`atlas-icon-grid__item${
                    activeTool === "draw-icon" && drawIcon === key ? " atlas-icon-grid__item--active" : ""
                  }`}
                  onClick={() => { setDrawIcon(key); setActiveTool("draw-icon"); }}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </LabelTooltip>
            ))}
          </div>
        </div>
      </div>

      <div className="atlas-dropdown-section">
        <div className="space-y-3">
          <DropdownModeSelector
            label={t('toolbar.ink')}
            value={drawColor}
            options={[
              { value: '#ffffff' as const, icon: Circle, label: t('color.white') },
              { value: '#000000' as const, icon: Circle, label: t('color.black') },
            ]}
            onChange={(color) => setDrawColor(color)}
          />

          <DropdownSliderRow
            label={t('toolbar.penSize')}
            value={drawWidth}
            min={1}
            max={40}
            onChange={(width) => setDrawWidth(width)}
          />

          <DropdownSliderRow
            label={t('toolbar.eraserSize')}
            value={eraserWidth}
            min={10}
            max={200}
            onChange={(width) => setEraserWidth(width)}
          />
        </div>
      </div>

      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          icon={Trash2}
          label={t('toolbar.deleteDrawings')}
          destructive
          onClick={() => {
            emit('drawing-clear-all');
            closeMenu();
          }}
        />
      </div>
    </ToolGroup>
  )
}
