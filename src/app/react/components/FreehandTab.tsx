import React, { useEffect, useMemo, useState } from 'react';
import { gridOffsetCenteredAt, normaliseGridOffset } from '../../grid/gridPlacement';
import { isHexGridType } from '../../grid/hexGeometry';
import { NO_STRETCH, sameStretch } from '../../grid/mapStretch';
import type { AlignmentResult } from '../../pixi/gridAlignmentMath';
import { useAlignmentPreview, useArrowNudge, useCrosshairCursor } from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';
import { useFreehandGridPlacement } from '../hooks/useFreehandGridPlacement';
import type { FreehandPlacement } from '../hooks/useFreehandGridPlacement';
import { useFittedAlignment } from '../hooks/useGridFit';
import { AlignmentSummary } from './AlignmentSummary';
import { t } from '../../i18n';

const NOT_PLACED: AlignmentResult[] = [];

/**
 * Places a grid by eye: a token in a small patch of grid follows the pointer at a
 * fixed size on screen, the map's zoom sets the cell size, and a click puts the
 * grid there. On a map with a printed grid the placed grid is then fitted to its lines.
 */
export function FreehandTab({ controller, view, result, setResult, gridType, fit }: AlignmentTabProps): React.ReactElement {
  const [placement, setPlacement] = useState<FreehandPlacement | null>(null);
  const isPlaced = placement !== null;

  useCrosshairCursor(isPlaced, view);
  const offsetAdjust = useArrowNudge(isPlaced);
  const liveCellSize = useFreehandGridPlacement(view, gridType, !isPlaced, setPlacement);

  const placed = useMemo((): AlignmentResult[] => {
    if (!placement) return NOT_PLACED;
    const { cellSize, point, mapStretch } = placement;
    const centred = gridOffsetCenteredAt(gridType, cellSize, point);
    const offsets = normaliseGridOffset(gridType, cellSize, centred.offsetX, centred.offsetY);
    return [{ cellSize, ...offsets, gridType, ...(sameStretch(mapStretch, NO_STRETCH) ? {} : { mapStretch }) }];
  }, [placement, gridType]);
  const fitted = useFittedAlignment(placed, fit);
  useAlignmentPreview(fitted.result, offsetAdjust, controller, setResult);

  // The scene's current grid would only distract while the new one is placed; leaving the tab restores it.
  useEffect(() => {
    if (!isPlaced) controller?.hidePreview();
  }, [controller, isPlaced]);

  useEffect(() => () => view?.renderer?.cancelGridAlignment(), [view]);

  const hint = isPlaced
    ? t('align.placed')
    : t(isHexGridType(gridType) ? 'align.zoomHex' : 'align.zoomSquare');

  return (
    <>
      <p className="atlas-grid-alignment-hint">{hint}</p>

      {result && <AlignmentSummary result={result} fitting={fitted.pending} fitAsked={fit !== null} />}
      {!result && liveCellSize !== null && (
        <div className="atlas-grid-alignment-result">
          <div>{t('align.cellSize', { size: liveCellSize.toFixed(2) })}</div>
        </div>
      )}

      {isPlaced && (
        <button
          className="atlas-grid-alignment-btn atlas-grid-alignment-btn--secondary atlas-grid-alignment-btn--wide"
          onClick={() => setPlacement(null)}
        >
          {t('align.placeAgain')}
        </button>
      )}
    </>
  );
}
