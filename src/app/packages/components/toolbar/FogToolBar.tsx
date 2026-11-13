import React, { useCallback, useEffect, useState } from "react"
import { CloudOff, MoreHorizontal, PaintBucket, Trash2 } from "lucide-react"
import { areaIsHidden, fogAreaList, isFogArea } from "../../../fog/fogAreas"
import { hasCells } from "../../../fog/fogCells"
import { DEFAULT_FOG_TOOL, FOG_BRUSH_SIZES, fogToolFor, fogWhat, isFogTool, type FogShape, type FogWhat } from "../../../fog/fogToolChoices"
import { DEFAULT_GM_FOG_OPACITY, GM_FOG_OPACITY_RANGE } from "../../../fog/gmFogOpacity"
import { t } from "../../../i18n"
import { useAtlasSettings, useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { levelObjects } from "../../../levels/levelObjects"
import { hasLevels } from "../../../levels/sceneLevels"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { showNotice } from "../../../ui/notice"
import { DropdownMenu } from "../primitives/DropdownMenu"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { ToolButton } from "../primitives/ToolButton"
import { TooltipProvider } from "../primitives/tooltip"
import { FOG_AREA_SHAPES, FOG_SHAPES, FOG_WHATS } from "./fogToolChoices"
import { ChoiceButtons, GroupBreak, TOOL_BAR_CHOICE_CLASS, ToolOptionsBars } from "./ToolOptionsBar"

/** The dot on the size button, in pixels: as small and as large as the button's icon may be. */
const SIZE_DOT = { min: 4, max: 16 } as const

/**
 * The fog tool's bars above the main toolbar while the tool is chosen: what a stroke does (hide,
 * reveal, make areas), and beside it the shape it is drawn with, the brush's size, the two
 * actions on the whole map and a menu for what is rarely changed. The second bar is the same
 * whatever the tool does, so nothing moves when a choice changes: what cannot be chosen now is
 * shown disabled with its reason. The GM's alone; hidden while the toolbar is arranged.
 */
export function FogToolBar(): React.ReactElement {
  const shown = useAtlasStore((state) => isFogTool(state.activeTool) && !state.isPlayerView
    && !state.isToolbarEditing && !state.isMapLoading)
  return <ToolOptionsBars shown={shown}><FogBars /></ToolOptionsBars>
}

function FogBars(): React.ReactElement {
  const what = useAtlasStore(fogWhat)
  const shape = useAtlasStore((state) => state.fogTool.shape)
  const setActiveTool = useAtlasStore((state) => state.setActiveTool)
  const setFogTool = useAtlasStore((state) => state.setFogTool)
  const cells = useAtlasStore((state) => hasCells(state.grid))
  const areas = what === 'areas'
  /** Why a shape cannot be chosen now, or null: cells are the grid's, and an area cannot be brushed. */
  const unavailableShape = (value: FogShape): string | null => {
    if (value === 'cells' && !cells) return t('fog.cellsNeedGrid')
    return value === 'brush' && areas ? t('fog.brushNeedsOutline') : null
  }
  // Left where it can no longer be chosen (the map lost its grid), the tool takes its first shape: in Areas, the first with an outline.
  const cellsLeft = shape === 'cells' && !cells
  useEffect(() => {
    if (cellsLeft) setFogTool({ shape: DEFAULT_FOG_TOOL.shape })
  }, [cellsLeft, setFogTool])
  const choose = (next: FogWhat): void => {
    const { tool, areas } = fogToolFor(next)
    setFogTool({ areas })
    setActiveTool(tool)
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div role="toolbar" aria-label={t('fog.modes')} className="atlas-tool-bar atlas-tool-bar--modes">
        <ChoiceButtons kind="mode" locked={null} choices={FOG_WHATS} value={what} onChange={choose} />
      </div>
      <div role="toolbar" aria-label={t('fog.tools')} className="atlas-tool-bar atlas-tool-bar--tools">
        <ChoiceButtons kind="choice" locked={null} choices={areas ? FOG_AREA_SHAPES : FOG_SHAPES} value={shape} unavailable={unavailableShape} onChange={(next) => setFogTool({ shape: next })} />
        <BrushSize />
        <GroupBreak />
        <WholeMap />
        <GroupBreak />
        <MoreMenu />
      </div>
    </TooltipProvider>
  )
}

/** The brush's size as the size button shows it: a dot that grows with the brush. */
function BrushSizeDot(): React.ReactElement {
  const size = useAtlasStore((state) => state.fogTool.brushSize)
  const share = (size - FOG_BRUSH_SIZES.min) / (FOG_BRUSH_SIZES.max - FOG_BRUSH_SIZES.min)
  const dot = Math.round(SIZE_DOT.min + share * (SIZE_DOT.max - SIZE_DOT.min))
  return <span className="atlas-fog-size-dot" style={{ width: dot, height: dot }} />
}

/** The button that opens the brush's size above the bar. Only the brush has a size: beside another shape it stays, disabled. */
function BrushSize(): React.ReactElement {
  const size = useAtlasStore((state) => state.fogTool.brushSize)
  const brush = useAtlasStore((state) => state.fogTool.shape === 'brush')
  const setFogTool = useAtlasStore((state) => state.setFogTool)
  const hotkeyLabel = useHotkeyLabels()
  const [wanted, setWanted] = useState(false)
  const open = wanted && brush
  const toggle = useCallback((): void => setWanted((before) => brush && !before), [brush])
  // Another shape closes the slider for good: the brush chosen again does not bring it back.
  useEffect(() => {
    if (!brush) setWanted(false)
  }, [brush])
  return (
    <DropdownMenu
      isOpen={open}
      onToggle={toggle}
      label={t('fog.brushSize')}
      position="top"
      align="center"
      // The wrapper around the trigger takes the click.
      triggerButton={(
        <ToolButton
          icon={BrushSizeDot}
          label={t('fog.brushSize')}
          shortcut={`${hotkeyLabel('fogSmaller')} ${hotkeyLabel('fogLarger')}`}
          {...(!brush && { subtitle: t('fog.brushSizeNeedsBrush') })}
          isActive={false}
          disabled={!brush}
          menuExpanded={open}
          onClick={() => undefined}
          className={TOOL_BAR_CHOICE_CLASS}
        />
      )}
    >
      <div className="atlas-dropdown-section">
        <DropdownSliderRow
          label={t('fog.brushSize')}
          value={size}
          min={FOG_BRUSH_SIZES.min}
          max={FOG_BRUSH_SIZES.max}
          onChange={(next) => setFogTool({ brushSize: next })}
        />
      </div>
    </DropdownMenu>
  )
}

/** Cover all and Reveal all: the whole map of the level shown, each one undo step. */
function WholeMap(): React.ReactElement {
  const { renderer } = useAtlasUI()
  const coverAllFog = useAtlasStore((state) => state.coverAllFog)
  const clearFog = useAtlasStore((state) => state.clearFog)
  // A revealed area hides nothing: with only those left there is nothing to reveal.
  const anyFog = useAtlasStore((state) => Object.values(levelObjects(state).fog).some((operation) => !isFogArea(operation) || areaIsHidden(operation)))
  const levelled = useAtlasStore((state) => hasLevels(state.levels))
  // A scene without levels has no level to name.
  const coverTip = levelled ? t('fog.coverLevelTip') : t('fog.coverAllTip')
  const revealTip = levelled ? t('fog.revealLevelTip') : t('fog.revealAllTip')
  const noFog = levelled ? t('fog.noFogOnLevel') : t('fog.noFog')
  const cover = (): void => {
    if (!coverAllFog(renderer?.getMapRect() ?? null)) showNotice(t('fog.noMap'))
  }
  return (
    <>
      <ToolButton icon={PaintBucket} label={t('fog.coverAll')} subtitle={coverTip} isActive={false} onClick={cover} />
      <ToolButton icon={CloudOff} label={t('fog.revealAll')} subtitle={anyFog ? revealTip : noFog} isActive={false} disabled={!anyFog} onClick={clearFog} />
    </>
  )
}

/** What is rarely changed or done: how opaque fog is in the GM's view, kept on this device, and deleting the areas of the level shown. */
function MoreMenu(): React.ReactElement {
  const settings = useAtlasSettings()
  const [open, setOpen] = useState(false)
  const toggle = useCallback((): void => setOpen((before) => !before), [])
  const fog = useAtlasStore((state) => levelObjects(state).fog)
  const deleteFogAreas = useAtlasStore((state) => state.deleteFogAreas)
  const levelled = useAtlasStore((state) => hasLevels(state.levels))
  const deleteAreas = (): void => {
    // Every area of the level, also those past the number that are read.
    deleteFogAreas(Object.keys(fog).filter((id) => isFogArea(fog[id])))
    setOpen(false)
  }
  const percent = (opacity: number): number => Math.round(opacity * 100)
  return (
    <DropdownMenu
      isOpen={open}
      onToggle={toggle}
      label={t('fog.more')}
      position="top"
      align="right"
      // The wrapper around the trigger takes the click.
      triggerButton={<ToolButton icon={MoreHorizontal} label={t('fog.more')} isActive={false} menuExpanded={open} onClick={() => undefined} />}
    >
      <div className="atlas-dropdown-section">
        <DropdownSliderRow
          label={t('fog.gmOpacity')}
          value={percent(settings?.getGmFogOpacity() ?? DEFAULT_GM_FOG_OPACITY)}
          min={percent(GM_FOG_OPACITY_RANGE.min)}
          max={percent(GM_FOG_OPACITY_RANGE.max)}
          step={5}
          unit="%"
          // Shown where Atlas' settings cannot be reached, with nothing to set.
          disabled={!settings}
          onChange={(next) => settings?.setGmFogOpacity(next / 100)}
        />
      </div>
      <div className="atlas-dropdown-section">
        <DropdownMenuItem
          destructive
          icon={Trash2}
          label={levelled ? t('fog.deleteLevelAreas') : t('fog.deleteAreas')}
          disabled={fogAreaList(fog).length === 0}
          onClick={deleteAreas}
        />
      </div>
    </DropdownMenu>
  )
}
