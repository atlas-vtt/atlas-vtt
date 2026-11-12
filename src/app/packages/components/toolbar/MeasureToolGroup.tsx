import React, { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { SlidersHorizontal } from "lucide-react"
import { t } from "../../../i18n"
import { useAtlasSettings, useHotkeyLabels } from "../../../keyboard/useMapHotkeys"
import { DEFAULT_DRAG_DISTANCE, type DragDistance } from "../../../measure/dragDistance"
import { CollectionSettingsModal } from "../../../react/components/CollectionSettingsModal"
import { useMapCollectionId } from "../../../react/hooks/useMapCollectionId"
import { useAtlasUI } from "../../../react/root/AtlasUIContext"
import { useAtlasStore } from "../../../react/ViewStoreContext"
import { DropdownMenuItem } from "../primitives/DropdownMenuItem"
import { SegmentedControl, type SegmentedOption } from "../primitives/SegmentedControl"
import { ToolGroup, type ToolGroupControls } from "./ToolGroup"
import { measureToolFace } from "./toolFaces"

const DRAG_DISTANCE_OPTIONS: readonly SegmentedOption<DragDistance>[] = [
  { value: 'always', label: t('toolbar.dragDistanceAlways') },
  { value: 'combat', label: t('toolbar.dragDistanceCombat') },
  { value: 'never', label: t('toolbar.dragDistanceNever') },
]

/**
 * The measure tool. What a press measures and what becomes of a measurement are the bars above
 * the toolbar (`MeasureToolBar`); the menu keeps what has a value: when a dragged token shows its
 * distance (Atlas' own setting, for every map) and, for the GM, the way to the collection's rules
 * of measuring.
 */
export function MeasureToolGroup({ activeTool, selectTool, menuOpen, toggleMenu, closeMenu }: ToolGroupControls): React.ReactElement {
  const hotkeyLabel = useHotkeyLabels()
  const settings = useAtlasSettings()
  const mode = useAtlasStore((state) => state.measureTool.mode)
  const { view } = useAtlasUI()
  const playerView = useAtlasStore((state) => state.isPlayerView) || view?.getViewType?.() === 'atlas-vtt-player'
  const collectionId = useMapCollectionId()
  const [rulesOpen, setRulesOpen] = useState(false)
  const face = measureToolFace(activeTool, mode)

  return (
    <>
      <ToolGroup
        face={face}
        shortcut={hotkeyLabel('measure')}
        menuLabel={t('toolbar.measureOptions')}
        menuOpen={menuOpen}
        onSelect={() => selectTool(face.tool)}
        onMenuToggle={toggleMenu}
      >
        <div className="atlas-dropdown-section">
          <div className="atlas-dropdown-stack">
            <span className="atlas-dropdown-label">{t('toolbar.dragDistance')}</span>
            <SegmentedControl<DragDistance>
              value={settings?.getDragDistance() ?? DEFAULT_DRAG_DISTANCE}
              options={DRAG_DISTANCE_OPTIONS}
              ariaLabel={t('toolbar.dragDistance')}
              onChange={(choice) => settings?.setDragDistance(choice)}
            />
          </div>
        </div>
        {!playerView && (
          <div className="atlas-dropdown-section">
            {/* A map outside every collection has no rules of its own to open. */}
            <DropdownMenuItem
              icon={SlidersHorizontal}
              label={t('toolbar.measureRules')}
              disabled={collectionId === null}
              onClick={() => {
                setRulesOpen(true)
                closeMenu()
              }}
            />
          </div>
        )}
      </ToolGroup>
      <AnimatePresence>
        {rulesOpen && collectionId !== null && (
          <CollectionSettingsModal isOpen collectionId={collectionId} initialTab="grid" onClose={() => setRulesOpen(false)} />
        )}
      </AnimatePresence>
    </>
  )
}
