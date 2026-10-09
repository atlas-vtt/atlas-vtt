import React from 'react';
import type { AlignmentResult } from '../../pixi/gridAlignmentMath';
import { describeGridType } from '../hooks/useGridAlignmentEffects';
import { t } from '../../i18n';

interface AlignmentSummaryProps {
  result: AlignmentResult;
  /** The map's lines are being read for this alignment. */
  fitting?: boolean;
  /** The lines were asked: an alignment they did not confirm says so. */
  fitAsked?: boolean;
  children?: React.ReactNode;
}

function percentOver(factor: number): string {
  return ((factor - 1) * 100).toFixed(1);
}

/** What the map's lines said about the alignment; null where they were not asked. */
function linesStatus(confidence: number | undefined, fitting: boolean, fitAsked: boolean): string | null {
  if (fitting) return t('align.fitting');
  if (confidence !== undefined) return t('align.onLines', { percent: Math.round(confidence * 100) });
  return fitAsked ? t('align.noLines') : null;
}

/** What an alignment found: the grid, how much of it lies on the map's lines, and how it stretches the map. */
export function AlignmentSummary({ result, fitting = false, fitAsked = false, children }: AlignmentSummaryProps): React.ReactElement {
  const { cellSize, gridType, confidence, mapStretch } = result;
  const lines = linesStatus(confidence, fitting, fitAsked);

  return (
    <div className="atlas-grid-alignment-result">
      <div>
        {gridType
          ? t('align.gridFound', { type: describeGridType(gridType), size: cellSize.toFixed(2) })
          : t('align.cellSize', { size: cellSize.toFixed(2) })}
      </div>
      {lines && <div className="atlas-grid-alignment-measurements">{lines}</div>}
      {mapStretch && mapStretch.x > 1 && (
        <div className="atlas-grid-alignment-measurements">{t('align.stretchWider', { percent: percentOver(mapStretch.x) })}</div>
      )}
      {mapStretch && mapStretch.y > 1 && (
        <div className="atlas-grid-alignment-measurements">{t('align.stretchTaller', { percent: percentOver(mapStretch.y) })}</div>
      )}
      {children}
    </div>
  );
}
