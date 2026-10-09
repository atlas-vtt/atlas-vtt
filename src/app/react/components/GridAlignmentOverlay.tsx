import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { Crosshair, RotateCcw, Wand2 } from 'lucide-react';
import { useAtlasUI } from '../root/AtlasUIContext';
import { GridAlignmentController } from '../../pixi/GridAlignmentController';
import type { AlignmentResult } from '../../pixi/GridAlignmentController';
import type { GridType } from '../../grid/GridSystem';
import { gridAlignedTo } from '../../pixi/gridAlignmentMath';
import { detectGridFromMapImage } from '../../pixi/gridDetection/detectGrid';
import { describeGridType } from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';
import { useGridFit } from '../hooks/useGridFit';
import { ToggleSwitch } from '../../packages/components/primitives/Toggle';
import { GridTypePicker } from './GridTypePicker';
import { IntersectionsTab } from './IntersectionsTab';
import { FreehandTab } from './FreehandTab';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type AlignmentTab = 'intersections' | 'freehand';

const ALIGNMENT_TABS: ReadonlyArray<{ id: AlignmentTab; label: string }> = [
  { id: 'intersections', label: t('align.tab.intersections') },
  { id: 'freehand', label: t('align.tab.freehand') },
];

const TAB_COMPONENTS: Record<AlignmentTab, (props: AlignmentTabProps) => React.ReactElement> = {
  intersections: IntersectionsTab,
  freehand: FreehandTab,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GridAlignmentOverlayProps {
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GridAlignmentOverlay({ onClose }: GridAlignmentOverlayProps): React.ReactElement {
  const { view } = useAtlasUI();
  const store = view?.atlasStore;

  // The grid the GM aligns: the scene's own to begin with, theirs to change, and what auto-detect finds.
  const [gridType, setGridType] = useState<GridType>(() => store?.getState().grid?.type ?? 'square');
  const [fitToLines, setFitToLines] = useState(true);
  const fit = useGridFit(view);
  const [activeTab, setActiveTab] = useState<AlignmentTab>('intersections');
  const [result, setResult] = useState<AlignmentResult | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [, setControllerVersion] = useState(0);
  const [detecting, setDetecting] = useState(false);
  const [detectionStatus, setDetectionStatus] = useState<string | null>(null);

  const controllerRef = useRef<GridAlignmentController | null>(null);

  // -----------------------------------------------------------------------
  // Controller lifecycle
  // -----------------------------------------------------------------------

  const initController = useCallback((): void => {
    const viewport = view?.renderer?.getViewportInstance();
    const gridSystem = view?.renderer?.getGridSystem();
    const canvasEl = view?.renderer?.getCanvasElement();
    const mapImage = view?.renderer?.getMapImage?.() ?? null;
    if (!viewport || !gridSystem || !canvasEl) return;

    controllerRef.current = new GridAlignmentController(viewport, gridSystem, canvasEl, mapImage);
    setControllerVersion(v => v + 1);
  }, [view]);

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

  // -----------------------------------------------------------------------
  // Callbacks
  // -----------------------------------------------------------------------

  const handleCancel = useCallback((): void => {
    view?.renderer?.cancelGridAlignment?.();
    controllerRef.current?.destroy();
    controllerRef.current = null;
    onClose();
  }, [onClose, view]);

  const handleReset = useCallback((): void => {
    view?.renderer?.cancelGridAlignment?.();
    controllerRef.current?.destroy();
    controllerRef.current = null;

    setResult(null);
    setDetectionStatus(null);
    initController();
    setResetKey(k => k + 1);
  }, [initController, view]);

  const handleAutoDetect = useCallback((): void => {
    const mapImage = view?.renderer?.getMapImage?.();
    if (!mapImage || detecting) return;

    controllerRef.current?.cleanupVisuals();
    setResult(null);
    setResetKey(k => k + 1);
    setDetecting(true);
    setDetectionStatus(t('align.analysing'));

    // The map's pixels come from the tile worker, so the status paints before the CPU-bound detection runs.
    void detectGridFromMapImage(mapImage).catch((error: unknown): null => {
      console.error('[GridAlignment] Auto-detect failed', error);
      return null;
    }).then((detected) => {
      setDetecting(false);
      if (!detected || !detected.gridType) {
        setDetectionStatus(t('align.noGrid'));
        return;
      }
      setResult(detected);
      setGridType(detected.gridType);
      controllerRef.current?.showPreview(detected);
      setDetectionStatus(
        t('align.detectedFull', { type: describeGridType(detected.gridType), size: detected.cellSize.toFixed(2), percent: Math.round((detected.confidence ?? 0) * 100) }),
      );
    });
  }, [view, detecting]);

  const handleApply = useCallback((): void => {
    if (!store || !result) return;

    const { cellSize, offsetX, offsetY, gridType: resultType } = result;

    const renderer = view?.renderer;
    if (renderer?.applyGridAlignment) {
      renderer.applyGridAlignment(cellSize, offsetX, offsetY, resultType);
    }

    const currentGrid = store.getState().grid;
    if (!currentGrid) return;
    // The map keeps the stretch the preview gave it: the renderer follows the store's.
    store.getState().setGrid({ ...gridAlignedTo(currentGrid, result), enabled: true, visible: true });

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
    setResult(null);
    setDetectionStatus(null);
    setResetKey(k => k + 1);
  }, [view]);

  const handleTabChange = useCallback((tab: AlignmentTab): void => {
    if (tab === activeTab) return;
    restartTab();
    setActiveTab(tab);
  }, [activeTab, restartTab]);

  const handleGridTypeChange = useCallback((type: GridType): void => {
    if (type === gridType) return;
    restartTab();
    setGridType(type);
  }, [gridType, restartTab]);

  const handleFitToLinesChange = useCallback((): void => {
    restartTab();
    setFitToLines(on => !on);
  }, [restartTab]);

  // -----------------------------------------------------------------------
  // Escape key
  // -----------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCancel]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const ActiveTab = TAB_COMPONENTS[activeTab];
  const fitLabelId = useId();

  return (
    <div className="atlas-vtt-plugin atlas-vtt-root" style={{ pointerEvents: 'none' }}>
      <div className="atlas-grid-alignment-panel">
        <div className="atlas-grid-alignment-header">
          <div className="atlas-grid-alignment-title">
            <Crosshair size={16} />
            <span>{t('align.title')}</span>
          </div>
          <CloseButton onClick={handleCancel} />
        </div>

        {/* Tab switcher */}
        <div className="atlas-grid-alignment-tabs">
          {ALIGNMENT_TABS.map(tab => (
            <button
              key={tab.id}
              className={`atlas-grid-alignment-tab${activeTab === tab.id ? ' is-active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Automatic detection from the map image; the tabs below stay available as the manual path */}
        <LabelTooltip label={t('align.detectHint')}>
          <button
            className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary atlas-grid-alignment-btn--wide"
            disabled={detecting}
            onClick={handleAutoDetect}
          >
            <Wand2 size={14} />
            {detecting ? t('align.detecting') : t('align.autoDetect')}
          </button>
        </LabelTooltip>
        {detectionStatus && <p className="atlas-grid-alignment-hint">{detectionStatus}</p>}

        <GridTypePicker value={gridType} onChange={handleGridTypeChange} />

        <LabelTooltip label={t('align.fitToLinesTip')} describe>
          <div className="atlas-grid-alignment-switch">
            <span id={fitLabelId}>{t('align.fitToLines')}</span>
            <ToggleSwitch value={fitToLines} labelledBy={fitLabelId} onChange={handleFitToLinesChange} />
          </div>
        </LabelTooltip>

        {/* Active tab content */}
        <ActiveTab
          key={resetKey}
          controller={controllerRef.current}
          view={view}
          result={result}
          setResult={setResult}
          gridType={gridType}
          fit={fitToLines ? fit : null}
        />

        {/* Action buttons */}
        <div className="atlas-grid-alignment-actions">
          <button className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary" onClick={handleReset}>
            <RotateCcw size={14} />
            {t('common.reset')}
          </button>
          <button className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary" onClick={handleCancel}>
            {t('common.cancel')}
          </button>
          <button
            className="atlas-grid-alignment-btn atlas-grid-alignment-btn--primary"
            disabled={!result}
            onClick={handleApply}
          >
            {t('common.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
