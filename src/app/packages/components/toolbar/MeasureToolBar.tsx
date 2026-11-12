import React, { useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, Pin, Trash2 } from "lucide-react"
import { t } from "../../../i18n"
import { useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { levelObjects } from "../../../levels/levelObjects"
import { hasLevels } from "../../../levels/sceneLevels"
import { measureList } from "../../../measure/keptMeasures"
import { DEFAULT_MEASURE_TOOL } from "../../../measure/measureTypes"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { DropdownMenu } from "../primitives/DropdownMenu"
import { DropdownSwatchGrid } from "../primitives/DropdownSwatchGrid"
import { ToolButton } from "../primitives/ToolButton"
import { TooltipProvider } from "../primitives/tooltip"
import { MEASURE_COLOR_SWATCHES, MEASURE_MODES, PLAYER_MEASURE_MODES, measureColorOfSwatch, measureModeChoice, swatchOfMeasureColor } from "./measureToolChoices"
import { ChoiceButtons, TOOL_BAR_CHOICE_CLASS, ToolOptionsBars } from "./ToolOptionsBar"
import { useUnavailableMeasureModes } from "./useUnavailableMeasureModes"

interface MeasureToolBarProps {
  /** The players' view measures too, but keeps nothing: it gets the modes alone. */
  playerView: boolean
}

/**
 * The measure tool's bars above the main toolbar while the tool is chosen: what a press measures,
 * and beside it what becomes of a measurement (kept, shown to the players, its colour) and the
 * button that clears the kept ones. The second bar is the same in every mode, so nothing moves
 * when the mode changes. Measuring is the same in the session view, so the bars take every choice
 * there. Hidden while the toolbar is arranged.
 */
export function MeasureToolBar({ playerView }: MeasureToolBarProps): React.ReactElement {
  const shown = useAtlasStore((state) => state.activeTool === 'measure' && !state.isToolbarEditing && !state.isMapLoading)
  return <ToolOptionsBars shown={shown}><MeasureBars playerView={playerView} /></ToolOptionsBars>
}

function MeasureBars({ playerView }: MeasureToolBarProps): React.ReactElement {
  const mode = useAtlasStore((state) => state.measureTool.mode)
  const setMeasureTool = useAtlasStore((state) => state.setMeasureTool)
  const unavailable = useUnavailableMeasureModes()
  // Ranges shows the GM's own rings: the players' view has no such mode. Left where it can no longer be chosen, the tool takes its first mode.
  const rangesLeft = mode === 'ranges' && (playerView || unavailable(mode) !== null)
  useEffect(() => {
    if (rangesLeft) setMeasureTool({ mode: DEFAULT_MEASURE_TOOL.mode })
  }, [rangesLeft, setMeasureTool])
  return (
    <TooltipProvider delayDuration={300}>
      <div role="toolbar" aria-label={t('toolbar.measureModes')} className="atlas-tool-bar atlas-tool-bar--modes">
        <ChoiceButtons kind="mode" locked={null} choices={playerView ? PLAYER_MEASURE_MODES : MEASURE_MODES} value={measureModeChoice(mode).value} unavailable={unavailable}
          onChange={(value) => setMeasureTool({ mode: value })} />
      </div>
      {!playerView && <MeasurementChoices />}
    </TooltipProvider>
  )
}

/** Keep, Players, the colour and Clear: the same four in every mode. */
function MeasurementChoices(): React.ReactElement {
  const keep = useAtlasStore((state) => state.measureTool.keep)
  const players = useAtlasStore((state) => state.measureTool.players)
  const setMeasureTool = useAtlasStore((state) => state.setMeasureTool)
  const clearMeasures = useAtlasStore((state) => state.clearMeasures)
  const anyKept = useAtlasStore((state) => measureList(levelObjects(state).measures).length > 0)
  const levelled = useAtlasStore((state) => hasLevels(state.levels))
  const hotkeyLabel = useHotkeyLabels()
  // A scene without levels has no level to name.
  const clearTip = levelled ? t('toolbar.measureClearTip') : t('toolbar.measureClearAllTip')
  const nothingKept = levelled ? t('toolbar.measureNothingKeptOnLevel') : t('toolbar.measureNothingKept')
  return (
    <div role="toolbar" aria-label={t('toolbar.measureChoices')} className="atlas-tool-bar atlas-tool-bar--tools">
      <ToolButton
        icon={Pin}
        label={t('toolbar.measureKeep')}
        shortcut={hotkeyLabel('measureKeep')}
        subtitle={t('toolbar.measureKeepTip')}
        isActive={keep}
        pressed={keep}
        onClick={() => setMeasureTool({ keep: !keep })}
        className={TOOL_BAR_CHOICE_CLASS}
      />
      <ToolButton
        icon={players ? Eye : EyeOff}
        label={t('toolbar.measurePlayers')}
        isActive={players}
        pressed={players}
        onClick={() => setMeasureTool({ players: !players })}
        className={TOOL_BAR_CHOICE_CLASS}
      />
      <MeasureColour />
      <ToolButton
        icon={Trash2}
        label={t('toolbar.measureClear')}
        subtitle={anyKept ? clearTip : nothingKept}
        isActive={false}
        disabled={!anyKept}
        onClick={clearMeasures}
      />
    </div>
  )
}

/** The colour the next measurement takes, as the dot the colour button shows. */
function MeasureColourDot(): React.ReactElement {
  const color = useAtlasStore((state) => state.measureTool.color)
  return <span className="atlas-tool-bar__dot" style={{ backgroundColor: swatchOfMeasureColor(color) }} />
}

/** The dot that opens the colours above the bar; a choice closes them. */
function MeasureColour(): React.ReactElement {
  const color = useAtlasStore((state) => state.measureTool.color)
  const setMeasureTool = useAtlasStore((state) => state.setMeasureTool)
  const [open, setOpen] = useState(false)
  const toggle = useCallback((): void => setOpen((before) => !before), [])
  return (
    <DropdownMenu
      isOpen={open}
      onToggle={toggle}
      label={t('toolbar.colour')}
      position="top"
      align="center"
      // The wrapper around the trigger takes the click.
      triggerButton={<ToolButton icon={MeasureColourDot} label={t('toolbar.colour')} isActive={false} menuExpanded={open} onClick={() => undefined} />}
    >
      <div className="atlas-dropdown-section">
        <DropdownSwatchGrid
          label={t('toolbar.colour')}
          swatches={MEASURE_COLOR_SWATCHES}
          value={swatchOfMeasureColor(color)}
          onChange={(swatch) => {
            setMeasureTool({ color: measureColorOfSwatch(swatch) })
            setOpen(false)
          }}
        />
      </div>
    </DropdownMenu>
  )
}
