import React, { useEffect, useMemo, useState } from 'react';
import { gridOffsetCenteredAt, normaliseGridOffset } from '../../grid/gridPlacement';
import { NO_STRETCH, sameStretch } from '../../grid/mapStretch';
import type { AlignmentResult } from '../../pixi/gridAlignmentMath';
import { useAlignmentPreview, useCrosshairCursor } from '../hooks/useGridAlignmentEffects';
import type { AlignmentTabProps } from '../hooks/useGridAlignmentEffects';
import { useFreehandGridPlacement } from '../hooks/useFreehandGridPlacement';
import type { FreehandPlacement } from '../hooks/useFreehandGridPlacement';
import { t } from '../../i18n';

/**
 * Places a grid by eye: a token in a small patch of grid follows the pointer at a
 * fixed size on screen, the map's zoom sets the cell size, and a click puts the
 * grid there. The grid stays exactly as it was placed: this is the way to a grid on a map that
 * has none, and to one that differs from the lines a map has, so those lines are never asked.
 */
export function FreehandTab({ controller, view, setResult, gridType }: AlignmentTabProps): React.ReactElement | null {
  const [placement, setPlacement] = useState<FreehandPlacement | null>(null);
  const isPlaced = placement !== null;

  useCrosshairCursor(isPlaced, view);
  useFreehandGridPlacement(view, gridType, !isPlaced, setPlacement);

  const placed = useMemo((): AlignmentResult | null => {
    if (!placement) return null;
    const { cellSize, point, mapStretch } = placement;
    const centred = gridOffsetCenteredAt(gridType, cellSize, point);
    const offsets = normaliseGridOffset(gridType, cellSize, centred.offsetX, centred.offsetY);
    return { cellSize, ...offsets, gridType, ...(sameStretch(mapStretch, NO_STRETCH) ? {} : { mapStretch }) };
  }, [placement, gridType]);
  useAlignmentPreview(placed, controller, setResult);

  // The scene's current grid would only distract while the new one is placed; leaving the tab restores it.
  useEffect(() => {
    if (!isPlaced) controller?.hidePreview();
  }, [controller, isPlaced]);

  useEffect(() => () => view?.renderer?.cancelGridAlignment(), [view]);

  return isPlaced ? null : <p className="atlas-grid-alignment-instruction">{t('align.freehandHint')}</p>;
}
