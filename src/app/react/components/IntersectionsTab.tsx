import React, { useState, useEffect, useMemo } from 'react';
import type { AlignmentPoint } from '../../pixi/GridAlignmentController';
import { alignmentCandidates, isPointInQuadrant } from '../../pixi/gridAlignmentMath';
import type { GridType } from '../../grid/GridSystem';
import { isHexGridType } from '../../grid/hexGeometry';
import { NO_STRETCH, sameStretch, type MapStretch } from '../../grid/mapStretch';
import type { AlignmentResult, MeasurementPair } from '../../pixi/gridAlignmentMath';
import {
  useCrosshairCursor,
  useCanvasClick,
  useCursorPreview,
  useAlignmentPreview,
  alignmentPointHints,
} from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';
import { useFittedAlignment } from '../hooks/useGridFit';
import { t } from '../../i18n';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOTAL_PAIRS = 4;
const TOTAL_STEPS = TOTAL_PAIRS * 2;
const NO_CANDIDATES: AlignmentResult[] = [];

/** The grids the measurements can stand for, in the world as the map was drawn while they were taken. */
function measuredGrids(measurements: MeasurementPair[], gridType: GridType, stretch: MapStretch): AlignmentResult[] {
  const candidates = alignmentCandidates(measurements, gridType);
  return sameStretch(stretch, NO_STRETCH) ? candidates : candidates.map((candidate) => ({ ...candidate, mapStretch: stretch }));
}

function midpoint({ a, b }: MeasurementPair): AlignmentPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IntersectionsTab({ controller, view, setResult, gridType, fit }: AlignmentTabProps): React.ReactElement {
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
  // A fit's waves run out from the first measurement, where the GM has just clicked.
  const scan = useMemo(() => ({ controller, origin: measurements[0] ? midpoint(measurements[0]) : null }), [controller, measurements]);
  const fitted = useFittedAlignment(measurements.length === 1 || isPreviewing ? candidates : NO_CANDIDATES, fit, scan);
  const foundOnLines = fitted.result?.confidence !== undefined;
  useEffect(() => {
    if (!foundOnLines) return;
    // The grid comes from the lines now: the clicks that named it, a half-made measurement too, are done with.
    controller?.cleanupVisuals();
    setStep(TOTAL_STEPS);
  }, [foundOnLines, controller]);

  // Shared hooks
  useCrosshairCursor(isPreviewing, view);
  useCursorPreview(isPreviewing, isPlacingA, currentPointA, controller, !isHex);
  useAlignmentPreview(isPreviewing ? fitted.result : null, controller, setResult);

  // -----------------------------------------------------------------------
  // Instruction text
  // -----------------------------------------------------------------------

  /** One short line: which corner to click now. The lit quarter of the map says where. */
  function getInstructionText(): string {
    if (!isPlacingA) return t(hints.second);
    // The first measurement is usually all it takes: more are asked for only where the lines did not answer.
    return t(measurements.length > 0 && !fitted.pending ? 'align.measureMore' : hints.first);
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
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {!isPreviewing && <p className="atlas-grid-alignment-instruction">{getInstructionText()}</p>}

      {/* How many cells were measured: shown only once one was not enough */}
      {!isPreviewing && measurements.length > 0 && (
        <div className="atlas-grid-alignment-dots" role="img" aria-label={t('align.measureCount', { done: measurements.length, total: TOTAL_PAIRS })}>
          {Array.from({ length: TOTAL_PAIRS }, (_, i) => (
            <span key={i} className={i < measurements.length ? 'is-done' : undefined} />
          ))}
        </div>
      )}
    </>
  );
}
