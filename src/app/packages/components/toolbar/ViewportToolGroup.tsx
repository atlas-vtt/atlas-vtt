import React, { useCallback, useEffect, useMemo } from "react"
import { Trash2 } from "lucide-react"
import { useStore } from "zustand"
import { t } from "../../../i18n"
import { useAtlasSettings, useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { useAtlasStore, useViewStoreHook } from "src/app/react/ViewStoreContext"
import { DEFAULT_SETTINGS } from "../../../services/atlasSettings"
import { PlayerWindowService } from "../../../services/PlayerWindowService"
import { runHistoryTransaction, runUntracked } from "../../../stores/history"
import { playerWindowStore } from "../../../stores/playerWindowStore"
import type { TVCalibrationSettings } from "../../../types/viewportTypes"
import { calibratedViewportSize, CM_PER_INCH, physicalCmPerSquare } from "../../../utils/viewportPhysicalScale"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { DropdownSliderRow } from "../primitives/DropdownSliderRow"
import { DropdownToggleRow } from "../primitives/DropdownToggleRow"
import { SegmentedControl } from "../primitives/SegmentedControl"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { viewportToolFace } from "./toolFaces"

const roundTo = (value: number, places: number): number => Math.round(value * 10 ** places) / 10 ** places

/** The shapes TVs come in. Only the shape matters to the frame, so a choice sets a typical resolution of it. */
const SCREEN_SHAPES = [
  { value: "16:9", width: 1920, height: 1080 },
  { value: "16:10", width: 1920, height: 1200 },
  { value: "21:9", width: 2560, height: 1080 },
  { value: "4:3", width: 1600, height: 1200 },
] as const

/** A saved shape counts as one of the choices when it is within this share of its ratio. */
const SHAPE_TOLERANCE = 0.06

/** The choice a saved resolution has the shape of, or none for an unusual screen. */
function shapeOf({ resolutionWidth, resolutionHeight }: TVCalibrationSettings): string {
  const ratio = resolutionWidth / resolutionHeight
  const closest = SCREEN_SHAPES.reduce((best, shape) =>
    Math.abs(shape.width / shape.height - ratio) < Math.abs(best.width / best.height - ratio) ? shape : best)
  return Math.abs(closest.width / closest.height - ratio) / ratio <= SHAPE_TOLERANCE ? closest.value : ""
}

/** TV viewport calibration and follow controls. DM only, behind TV_VIEWPORT_ENABLED. */
export function ViewportToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const settingsService = useAtlasSettings()
  const face = viewportToolFace(activeTool)

  const stored = settingsService?.getTVCalibration() ?? DEFAULT_SETTINGS.tvCalibration
  const { diagonalInches, resolutionWidth, resolutionHeight, targetSquareCm, squareUnit } = stored
  const calibration = useMemo<TVCalibrationSettings>(
    () => ({ diagonalInches, resolutionWidth, resolutionHeight, targetSquareCm, squareUnit }),
    [diagonalInches, resolutionWidth, resolutionHeight, targetSquareCm, squareUnit],
  )
  const inches = squareUnit === 'in'

  const updateCalibration = useCallback(
    (updates: Partial<TVCalibrationSettings>): void => {
      settingsService?.setTVCalibration(updates)
    },
    [settingsService],
  )

  const viewports = useAtlasStore((state) => state.objects.viewports)
  const gridSize = useAtlasStore((state) => state.grid?.size ?? 70)
  const updateViewport = useAtlasStore((state) => state.updateViewport)
  const store = useViewStoreHook()
  const activeRect = Object.values(viewports).find((vp) => vp.active)
  const isFollowingViewport = useStore(playerWindowStore, (s) => s.isFollowingViewport)

  const toggleLocked = useCallback((): void => {
    if (!activeRect) return
    updateViewport(activeRect.id, { locked: !activeRect.locked })
  }, [activeRect, updateViewport])

  // While the active rect is locked to physical scale, its size follows the
  // calibration settings (and the current grid) live: this is what makes
  // changing the TV size or the square size actually resize the rect.
  useEffect(() => {
    if (!activeRect || !activeRect.locked) return
    const { width, height } = calibratedViewportSize(calibration, gridSize)
    if (Math.abs(width - activeRect.width) < 0.01 && Math.abs(height - activeRect.height) < 0.01) return
    const centerX = activeRect.x + activeRect.width / 2
    const centerY = activeRect.y + activeRect.height / 2
    // Derived from the settings, not an edit of the map: undo must not step through it.
    runUntracked(store, () => updateViewport(activeRect.id, { x: centerX - width / 2, y: centerY - height / 2, width, height }))
  }, [activeRect, calibration, gridSize, store, updateViewport])

  /** Takes the frame off the map; players then follow the DM's camera again. One undo step. */
  const removeViewports = useCallback((): void => {
    runHistoryTransaction(store, () => {
      const { objects, deleteViewport } = store.getState()
      for (const id of Object.keys(objects.viewports)) deleteViewport(id)
    })
    closeMenu()
  }, [store, closeMenu])

  const toggleFollow = useCallback((): void => {
    PlayerWindowService.getInstance()?.toggleViewportFollow()
  }, [])

  const chooseShape = useCallback((value: string): void => {
    const shape = SCREEN_SHAPES.find((candidate) => candidate.value === value)
    if (shape) updateCalibration({ resolutionWidth: shape.width, resolutionHeight: shape.height })
  }, [updateCalibration])

  const cmPerSquare = activeRect && !activeRect.locked
    ? physicalCmPerSquare(calibration, gridSize, activeRect.width)
    : null

  return (
    <ToolGroup
      face={face}
      shortcut={hotkeyLabel('viewport')}
      menuLabel={t('toolbar.viewportOptions')}
      menuOpen={menuOpen}
      onSelect={() => selectTool(face.tool)}
      onMenuToggle={toggleMenu}
    >
      <div className="atlas-dropdown-section">
        <DropdownSliderRow
          label={t('toolbar.viewportSize')}
          value={calibration.diagonalInches}
          min={15}
          max={100}
          unit={'"'}
          onChange={(diagonalInches) => updateCalibration({ diagonalInches })}
        />
        <div className="atlas-dropdown-slider-row__head">
          <span className="atlas-dropdown-label">{t('toolbar.viewportShape')}</span>
          <span className="atlas-dropdown-slider-row__value">{t('toolbar.viewportShapeHint')}</span>
        </div>
        <SegmentedControl
          value={shapeOf(calibration)}
          options={SCREEN_SHAPES.map(({ value }) => ({ value, label: value }))}
          onChange={chooseShape}
          ariaLabel={t('toolbar.viewportShape')}
        />
        <DropdownSliderRow
          label={t('toolbar.viewportSquare')}
          value={inches ? roundTo(calibration.targetSquareCm / CM_PER_INCH, 2) : roundTo(calibration.targetSquareCm, 2)}
          min={inches ? 0.5 : 1}
          max={inches ? 2 : 5}
          step={inches ? 0.05 : 0.1}
          unit={inches ? '"' : " cm"}
          onChange={(size) => updateCalibration({ targetSquareCm: roundTo(inches ? size * CM_PER_INCH : size, 2) })}
        />
        <SegmentedControl
          value={squareUnit}
          options={[{ value: "in", label: t('toolbar.viewportUnitInches') }, { value: "cm", label: t('toolbar.viewportUnitCm') }]}
          onChange={(unit) => updateCalibration({ squareUnit: unit })}
          ariaLabel={t('toolbar.viewportUnit')}
        />
      </div>

      <div className="atlas-dropdown-section">
        <DropdownToggleRow
          label={t('toolbar.viewportLocked')}
          value={activeRect?.locked ?? true}
          onChange={toggleLocked}
        />
        {cmPerSquare !== null && (
          <div className="atlas-dropdown-slider-row__head">
            <span className="atlas-dropdown-label">{t('toolbar.viewportZoom')}</span>
            <span className="atlas-dropdown-slider-row__value">
              {inches
                ? t('toolbar.viewportInPerSquare', { value: roundTo(cmPerSquare / CM_PER_INCH, 2) })
                : t('toolbar.viewportCmPerSquare', { value: roundTo(cmPerSquare, 1) })}
            </span>
          </div>
        )}
        <DropdownToggleRow
          label={t('toolbar.viewportFollow')}
          value={isFollowingViewport}
          onChange={toggleFollow}
        />
      </div>

      {activeRect && (
        <div className="atlas-dropdown-section">
          <DropdownMenuItem icon={Trash2} label={t('toolbar.viewportRemove')} destructive onClick={removeViewports} />
        </div>
      )}
    </ToolGroup>
  )
}
