import React, { useCallback, useEffect, useState } from "react"
import { useViewStoreHook } from "src/app/react/ViewStoreContext"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownSwatchGrid } from "../primitives/DropdownSwatchGrid"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { textToolFace } from "./toolFaces"
import { useEmitViewEvent } from "./useEmitViewEvent"
import { t } from '../../../i18n'

/** Preset text colours: high-contrast neutrals plus map-legible accents. */
const TEXT_COLOR_SWATCHES = [
  { value: '#ffffff', label: t('color.white') },
  { value: '#000000', label: t('color.black') },
  { value: '#e93147', label: t('color.red') },
  { value: '#ec7500', label: t('color.orange') },
  { value: '#e0ac00', label: t('color.yellow') },
  { value: '#08b94e', label: t('color.green') },
  { value: '#086ddd', label: t('color.blue') },
  { value: '#7852ee', label: t('color.purple') },
] as const;

type TextSettings = { color: string; fontSize: number; bold: boolean }

/** The text tool, with colour, size and weight. DM only. */
export function TextToolGroup({ activeTool, selectTool, menuOpen, toggleMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const store = useViewStoreHook()
  const emit = useEmitViewEvent()
  const [textColor, setTextColor] = useState('#ffffff')
  const [textSize, setTextSize] = useState(24)
  const [textBold, setTextBold] = useState(false)
  const face = textToolFace(activeTool)

  useEffect(() => {
    emit('text-settings-changed', { color: textColor, fontSize: textSize, bold: textBold });
  }, [emit, textColor, textSize, textBold]);

  /**
   * Styling applies to the selected text element when there is exactly one,
   * otherwise it becomes the default for the next text placed.
   */
  const applyTextSetting = useCallback((updates: Partial<TextSettings>): void => {
    const state = store.getState();
    const selected = state.selectedIds.filter((id) => id.startsWith('text_'));
    if (selected.length === 1) {
      state.updateText(selected[0]!, updates);
    }
  }, [store])

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('text')}
      menuLabel={t('toolbar.textOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownSwatchGrid
          label={t('toolbar.colour')}
          swatches={TEXT_COLOR_SWATCHES}
          value={textColor}
          onChange={(value) => { setTextColor(value); applyTextSetting({ color: value }); }}
        />
      </div>

      <div className="atlas-dropdown-section">
        <div className="space-y-3">
          <DropdownSliderRow
            label={t('toolbar.size')}
            value={textSize}
            min={10}
            max={96}
            onChange={(size) => { setTextSize(size); applyTextSetting({ fontSize: size }); }}
          />

          <DropdownToggleRow
            label={t('toolbar.bold')}
            value={textBold}
            onChange={() => {
              const bold = !textBold;
              setTextBold(bold);
              applyTextSetting({ bold });
            }}
          />
        </div>
      </div>
    </ToolGroup>
  )
}
