import React, { useState, useEffect, useMemo } from 'react';
import { Check } from 'lucide-react';
import type { AlignmentPoint } from '../../pixi/GridAlignmentController';
import { alignmentCandidates, isPointInQuadrant, measurementCellSize } from '../../pixi/gridAlignmentMath';
import type { GridType } from '../../grid/GridSystem';
import { isHexGridType } from '../../grid/hexGeometry';
import { NO_STRETCH, sameStretch, type MapStretch } from '../../grid/mapStretch';
import type { AlignmentResult, MeasurementPair } from '../../pixi/gridAlignmentMath';
import {
  useCrosshairCursor,
  useCanvasClick,
  useArrowNudge,
  useCursorPreview,
  useAlignmentPreview,
  alignmentPointHints,
} from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';
import { useFittedAlignment } from '../hooks/useGridFit';
import { AlignmentSummary } from './AlignmentSummary';
import { t } from '../../i18n';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUADRANT_LABELS = [t('align.area.topLeft'), t('align.area.topRight'), t('align.area.bottomLeft'), t('align.area.bottomRight')] as const;
const TOTAL_PAIRS = 4;
const TOTAL_STEPS = TOTAL_PAIRS * 2;
const NO_CANDIDATES: AlignmentResult[] = [];

/** The grids the measurements can stand for, in the world as the map was drawn while they were taken. */
function measuredGrids(measurements: MeasurementPair[], gridType: GridType, stretch: MapStretch): AlignmentResult[] {
  const candidates = alignmentCandidates(measurements, gridType);
  return sameStretch(stretch, NO_STRETCH) ? candidates : candidates.map((candidate) => ({ ...candidate, mapStretch: stretch }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntersectionsTab({ controller, view, result, setResult, gridType, fit }: AlignmentTabProps): React.ReactElement {
  const isHex = isHexGridType(gridType);
  const hints = alignmentPointHints(gridType);
  const [step, setStep] = useState(0);
  const [measurements, setMeasurements] = useState<MeasurementPair[]>([]);
  const [currentPointA, setCurrentPointA] = useState<AlignmentPoint | null>(null);
  /** How the map was drawn when the first point was clicked; a preview may stretch it otherwise later. */
  const [measuredStretch, setMeasuredStretch] = useState<MapStretch>(NO_STRETCH);

  // Derived state
  const isPreviewing = step >= TOTAL_STEPS;
  const quadrantIndex = Math.min(Math.floor(step / 2), 3) as 0 | 1 | 2 | 3;
  const isPlacingA = step % 2 === 0;

  // One measurement names the grid well enough for the map's lines to place it, so they are asked
  // after the first and, where they did not answer then, once all four are in.
  const candidates = useMemo(() => measuredGrids(measurements, gridType, measuredStretch), [measurements, gridType, measuredStretch]);
  const fitted = useFittedAlignment(measurements.length === 1 || isPreviewing ? candidates : NO_CANDIDATES, fit);
  const foundOnLines = fitted.result?.confidence !== undefined;
  useEffect(() => {
    if (!foundOnLines) return;
    // The grid comes from the lines now: the clicks that named it, a half-made measurement too, are done with.
    controller?.cleanupVisuals();
    setStep(TOTAL_STEPS);
  }, [foundOnLines, controller]);

  // Shared hooks
  useCrosshairCursor(isPreviewing, view);
  const offsetAdjust = useArrowNudge(isPreviewing);
  useCursorPreview(isPreviewing, isPlacingA, currentPointA, controller, !isHex);
  useAlignmentPreview(isPreviewing ? fitted.result : null, offsetAdjust, controller, setResult);

  // -----------------------------------------------------------------------
  // Instruction text
  // -----------------------------------------------------------------------

  function getInstructionText(): string {
    if (isPreviewing) {
      return t('align.preview');
    }
    const label = QUADRANT_LABELS[quadrantIndex];
    if (isPlacingA) {
      return t(hints.first, { area: label ?? '' });
    }
    return t(hints.second);
  }

  // -----------------------------------------------------------------------
  // Quadrant dimming + auto-zoom
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!controller) return;

    if (isPreviewing) {
      controller.clearQuadrantDimming();
      controller.zoomToFullMap();
    } else {
      const completedPairs = Math.floor(step / 2);
      controller.showQuadrantDimming(quadrantIndex, completedPairs);
      if (isPlacingA) {
        controller.zoomToQuadrant(quadrantIndex);
      }
    }
  }, [step, isPreviewing, quadrantIndex, isPlacingA, controller]);

  // -----------------------------------------------------------------------
  // Viewport clicks
  // -----------------------------------------------------------------------

  useCanvasClick(!isPreviewing && controller !== null, (e) => {
    if (!controller) return;
    const world = controller.screenToWorld(e.clientX, e.clientY);

    if (isPlacingA) {
      const mapBounds = controller.getMapBounds();
      if (mapBounds && !isPointInQuadrant(world, quadrantIndex, mapBounds)) return;

      if (step === 0) setMeasuredStretch(controller.getMapStretch());
      controller.showMeasurementCrosshair(step, world);
      setCurrentPointA(world);
      setStep(s => s + 1);
      return;
    }

    if (currentPointA && !isHex) world.y = currentPointA.y;
    controller.showMeasurementCrosshair(step, world);

    const pairIndex = Math.floor(step / 2);
    if (currentPointA) {
      controller.showMeasurementLine(pairIndex, currentPointA, world);
      setMeasurements(prev => [...prev, { a: currentPointA, b: world }]);
    }

    setCurrentPointA(null);
    setStep(s => s + 1);
  });

  // -----------------------------------------------------------------------
  // Individual cell sizes for display
  // -----------------------------------------------------------------------

  const individualSizes = measurements.map(p => measurementCellSize(p, gridType));

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Progress indicator */}
      <div className="atlas-grid-alignment-progress">
        {Array.from({ length: TOTAL_PAIRS }, (_, i) => {
          const pairStep = i * 2;
          const isCompleted = step > pairStep + 1;
          const isActive = quadrantIndex === i && !isPreviewing;

          return (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className={`atlas-grid-alignment-step-connector${
                  step > pairStep ? ' atlas-grid-alignment-step-connector--completed' : ''
                }`} />
              )}
              <div className={`atlas-grid-alignment-step${
                isActive ? ' atlas-grid-alignment-step--active' : ''
              }${isCompleted ? ' atlas-grid-alignment-step--completed' : ''}`}>
                {isCompleted ? <Check size={14} /> : i + 1}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <p className="atlas-grid-alignment-hint">{getInstructionText()}</p>

      {fitted.pending && !isPreviewing && <p className="atlas-grid-alignment-hint">{t('align.fitting')}</p>}

      {result && (
        <AlignmentSummary result={result} fitting={fitted.pending} fitAsked={fit !== null}>
          {!foundOnLines && measurements.length > 1 && (
            <div className="atlas-grid-alignment-measurements">
              {t('align.individual', { sizes: individualSizes.map(s => s.toFixed(1)).join(', ') })}
            </div>
          )}
          {!foundOnLines && result.maxResidual !== undefined && result.maxResidual > 3 && (
            <div className="atlas-grid-alignment-measurements">
              {t('align.disagree', { residual: result.maxResidual.toFixed(1) })}
            </div>
          )}
        </AlignmentSummary>
      )}
    </>
  );
}
