import React, { useState, useEffect, useCallback, useRef } from 'react';

import { Crosshair, Scan } from 'lucide-react';
import { useAtlasUI } from '../root/AtlasUIContext';
import { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentResult, ScanState } from '../../pixi/GridAlignmentController';
import type { GridType } from '../../grid/GridSystem';
import { gridAlignedTo } from '../../pixi/gridAlignmentMath';
import { movedWithMap, readMapStretch, sameStretch } from '../../grid/mapStretch';
import { runHistoryTransaction } from '../../stores/history';
import { createGridScan } from '../../services/gridScan';
import { useAlignmentEnds } from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';
import { useGridAutoDetect } from '../hooks/useGridAutoDetect';
import { useGridFit } from '../hooks/useGridFit';
import { SegmentedControl } from '../../packages/components/primitives/SegmentedControl';
import type { SegmentedOption } from '../../packages/components/primitives/SegmentedControl';
import { DetectedGridPreview } from './DetectedGridPreview';
import { GridTypePicker } from './GridTypePicker';
import { IntersectionsTab } from './IntersectionsTab';
import { FreehandTab } from './FreehandTab';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { t } from '../../i18n';
import { showNotice } from '../../ui/notice';
import { acceptsLevelDetection, applyLevelAlignment, levelBeingFitted } from './levels/levelImageAlignment';

type AlignmentTab = 'intersections' | 'freehand';
/** What the choice of a manual way holds while none is chosen. */
const NO_TAB = 'none';

const ALIGNMENT_TABS: readonly SegmentedOption<AlignmentTab | typeof NO_TAB>[] = [
  { value: 'intersections', label: t('align.tab.intersections') },
  { value: 'freehand', label: t('align.tab.freehand') },
];

const TAB_COMPONENTS: Record<AlignmentTab, (props: AlignmentTabProps) => React.ReactElement | null> = {
  intersections: IntersectionsTab,
  freehand: FreehandTab,
};

interface GridAlignmentOverlayProps {
  onClose: () => void;
}

export function GridAlignmentOverlay({ onClose }: GridAlignmentOverlayProps): React.ReactElement {
  const { view } = useAtlasUI();
  const store = view?.atlasStore;

  // The grid the GM aligns: the scene's own to begin with, theirs to change, and what auto-detect finds.
  const [gridType, setGridType] = useState<GridType>(() => store?.getState().grid?.type ?? 'square');
  const fit = useGridFit(view);
  /** The way the GM aligns by hand; none until they choose one, so opening the panel leaves the map as it is. */
  const [activeTab, setActiveTab] = useState<AlignmentTab | null>(null);
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [, setControllerVersion] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<string | null>(null);
  /** What a scan shows on the map: a search, a fit or a found grid being drawn, then the last of its glow. */
  const [scan, setScan] = useState<ScanState>('none');
  // Nothing is to be chosen while the map shows the engine at work: a click would cut what it shows short.
  const busy = detecting || scan === 'working';
  /** Closed while the engine was at work: the panel is out of sight, and gone once the work is over. */
  const [leaving, setLeaving] = useState(false);
  /** What auto-detect found: shown in place of the tab until the GM measures or places a grid themselves. */
  const [detected, setDetected] = useState<AlignmentResult | null>(null);

  const controllerRef = useRef<GridAlignmentController | null>(null);

  // -----------------------------------------------------------------------
  // Controller lifecycle
  // -----------------------------------------------------------------------

  const initController = useCallback((): void => {
    const renderer = view?.renderer;
    const viewport = renderer?.getViewportInstance();
    const gridSystem = renderer?.getGridSystem();
    const canvasEl = renderer?.getCanvasElement();
    if (!renderer || !viewport || !gridSystem || !canvasEl) return;
    const mapImage = renderer.getMapImage?.() ?? null;

    const scanLayer = createGridScan(() => store?.getState(), renderer);
    controllerRef.current = new GridAlignmentController(viewport, gridSystem, canvasEl, mapImage, scanLayer);
    controllerRef.current.onScan = setScan;
    setControllerVersion(v => v + 1);
  }, [view, store]);

  // -----------------------------------------------------------------------
  // Ensure viewport panning/zooming works during alignment
  // -----------------------------------------------------------------------

  useEffect(() => {
    const viewport = view?.renderer?.getViewportInstance();
    if (!viewport) return;

    // Dismiss any blocking overlays left over from how the user got here
    // (e.g. the command palette backdrop that sits full-screen above the canvas).
    const backdrop = document.querySelector<HTMLElement>('.atlas-command-palette-backdrop');
    if (backdrop) backdrop.click();
  }, [view]);

  useEffect(() => {
    initController();

    return () => {
      if (controllerRef.current) {
        view?.renderer?.cancelGridAlignment?.();
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
    };
  }, [initController, view]);

  // On a level that is not aligned with the scene's grid, the panel fits that level's image: drawn on its own while it lasts.
  useEffect(() => {
    const renderer = view?.renderer;
    if (!store || !renderer || !levelBeingFitted(store)) return;
    renderer.setLevelImageAlignment?.(true);
    return () => renderer.setLevelImageAlignment?.(false);
  }, [view, store]);

  // -----------------------------------------------------------------------
  // Callbacks
  // -----------------------------------------------------------------------

  const handleCancel = useCallback((): void => {
    view?.renderer?.cancelGridAlignment?.();
    controllerRef.current?.destroy();
    controllerRef.current = null;
    onClose();
  }, [onClose, view]);

  /** Forgets what was measured or detected, and starts the tab's content anew. */
  const clearAlignment = useCallback((): void => {
    controllerRef.current?.cancelScan();
    setDetecting(false);
    setResult(null);
    setDetected(null);
    setDetectionStatus(null);
    setResetKey(k => k + 1);
  }, []);

  const handleAutoDetect = useCallback((): void => {
    if (busy || !view?.renderer?.getMapImage?.()) return;
    controllerRef.current?.cleanupVisuals();
    clearAlignment();
    setDetecting(true);
    setDetectionStatus(t('align.analysing'));
  }, [view, busy, clearAlignment]);

  useGridAutoDetect(view, controllerRef, detecting, {
    status: setDetectionStatus,
    found: (grid) => {
      setDetecting(false);
      setDetectionStatus(null);
      if (grid.gridType) setGridType(grid.gridType);
      setDetected(grid);
    },
    none: () => {
      setDetecting(false);
      setDetectionStatus(null);
      // Said beside the panel, not in it: the panel holds its controls and nothing else.
      showNotice(t('align.noGrid'));
      if (leaving) return;
      // The way on from a map without a grid to find is to show Atlas one cell of it.
      setActiveTab((tab) => tab ?? 'intersections');
    },
    // On a level, only a grid the map's lines settle moves the level's image
    accepts: (grid) => {
      const level = store ? levelBeingFitted(store) : null;
      return !store || !level || acceptsLevelDetection(store, level, grid, view?.renderer?.getMapImage?.()?.imageSize);
    },
  });

  const handleApply = useCallback((): void => {
    if (!store || !result) return;
    const level = levelBeingFitted(store);
    if (level) {
      // The scene's grid stays; the level's image is fitted to it, and what stands on that level follows
      if (!applyLevelAlignment(store, level, result, view?.renderer?.getMapImage?.()?.imageSize)) return;
      controllerRef.current?.destroy();
      controllerRef.current = null;
      onClose();
      return;
    }

    const currentGrid = store.getState().grid;
    if (!currentGrid) return;
    const renderer = view?.renderer;
    // An aligned grid is a grid in use: it shows, and tokens snap to it.
    const grid = { ...gridAlignedTo(currentGrid, result), enabled: true, visible: true, snapToGrid: true };
    // The map keeps the stretch the preview gave it (the renderer follows the store's), and what
    // stands on the map keeps its place on it.
    const from = readMapStretch(currentGrid.mapStretch);
    const to = readMapStretch(grid.mapStretch);
    const imageSize = renderer?.getMapImage?.()?.imageSize;
    const move = imageSize && !sameStretch(from, to) ? movedWithMap(imageSize, from, to) : undefined;
    // One undo step: the grid, what moved with the map, and the tokens snapped to the new cells.
    runHistoryTransaction(store, () => {
      store.getState().alignGrid(grid, move);
      renderer?.applyGridAlignment?.(result.cellSize, result.offsetX, result.offsetY, result.gridType);
    });

    controllerRef.current?.destroy();
    controllerRef.current = null;
    onClose();
  }, [store, result, onClose, view]);

  // -----------------------------------------------------------------------
  // Tab switching — clean up visuals from previous tab
  // -----------------------------------------------------------------------

  /** Starts the active tab anew, as after another tab, grid type or way of fitting was chosen. */
  const restartTab = useCallback((): void => {
    controllerRef.current?.cleanupVisuals();
    view?.renderer?.cancelGridAlignment?.();
    clearAlignment();
  }, [clearAlignment, view]);

  /** Chooses a way of aligning by hand. Choosing the one already chosen starts it anew: to measure or place again. */
  const handleTabChange = useCallback((tab: AlignmentTab | typeof NO_TAB): void => {
    if (tab === NO_TAB) return;
    restartTab();
    setActiveTab(tab);
  }, [restartTab]);

  const handleGridTypeChange = useCallback((type: GridType): void => {
    if (type === gridType) return;
    restartTab();
    setGridType(type);
  }, [gridType, restartTab]);

  /** Closes the panel. The engine's work on the map is never cut short: it plays out, and the grid it finds is the scene's. */
  const handleClose = useCallback((): void => {
    if (busy) setLeaving(true);
    else handleCancel();
  }, [busy, handleCancel]);

  useEffect(() => {
    // The panel is out of sight, so nothing waits for it: the scan plays out to its very end. A found
    // grid becomes the result one render after the search ends.
    if (!leaving || detecting || scan !== 'none' || (detected && !result && controllerRef.current)) return;
    if (result) handleApply();
    else handleCancel();
  }, [leaving, detecting, scan, detected, result, handleApply, handleCancel]);

  useAlignmentEnds(store, handleCancel, handleClose);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  // Measuring or placing by hand: not while a detection runs or its answer is shown.
  const ManualTab = activeTab && !detected && !detecting ? TAB_COMPONENTS[activeTab] : null;
  // Auto detect's own work: its search, and the grid it found being drawn.
  const autoDetecting = detecting || (scan === 'working' && !ManualTab);

  return (
    <div className="atlas-vtt-plugin atlas-vtt-root" style={{ pointerEvents: 'none' }}>
      <div className="atlas-grid-alignment" hidden={leaving}>
        <div className="atlas-grid-alignment-panel">
          <div className="atlas-grid-alignment-header">
            <div className="atlas-grid-alignment-title">
              <Crosshair size={16} />
              <span>{t('align.title')}</span>
            </div>
            <CloseButton onClick={handleClose} />
          </div>

          {/* The three ways to a grid stay where they are in every state: another one is one click away. */}
          {/* A detection at work shows in its own button, as light passing through it; its words are for screen readers. */}
          <button
            className={`atlas-grid-alignment-btn atlas-grid-alignment-btn--wide atlas-grid-alignment-detect ${!autoDetecting && (ManualTab || detected) ? 'atlas-grid-alignment-btn--secondary' : 'atlas-grid-alignment-btn--primary'}`}
            data-working={autoDetecting || undefined}
            aria-busy={autoDetecting || undefined}
            disabled={busy && !autoDetecting}
            onClick={handleAutoDetect}
          >
            <Scan size={14} />
            {t('align.find')}
          </button>
          <p className="atlas-grid-alignment-status" aria-live="polite">{detecting ? detectionStatus : null}</p>
          <SegmentedControl value={ManualTab && activeTab ? activeTab : NO_TAB} options={ALIGNMENT_TABS} onChange={handleTabChange} ariaLabel={t('align.orByHand')} disabled={busy} />

          {/* Every control keeps its place, so the panel is as tall in every state: the grid type is for aligning by hand. */}
          <GridTypePicker value={gridType} onChange={handleGridTypeChange} disabled={!ManualTab || busy} />
          {detected && <DetectedGridPreview controller={controllerRef.current} detected={detected} setResult={setResult} />}

          <button className="atlas-grid-alignment-btn atlas-grid-alignment-btn--primary atlas-grid-alignment-btn--wide" disabled={!result || busy} onClick={handleApply}>
            {t('common.apply')}
          </button>
        </div>

        {/* What to click next stands below the panel, which therefore never changes with it. */}
        <div className="atlas-grid-alignment-hint">
          {ManualTab && (
            <ManualTab
              key={resetKey}
              controller={controllerRef.current}
              view={view}
              setResult={setResult}
              gridType={gridType}
              fit={fit}
            />
          )}
        </div>
      </div>
    </div>
  );
}
