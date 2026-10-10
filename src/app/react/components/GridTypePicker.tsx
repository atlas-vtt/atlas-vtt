import React from 'react';
import { Hexagon, Square } from 'lucide-react';
import type { GridType } from '../../grid/GridSystem';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { t } from '../../i18n';

const GRID_TYPE_CHOICES: ReadonlyArray<{ type: GridType; label: string; tooltip: string; icon: React.ReactElement }> = [
  { type: 'square', label: t('align.square'), tooltip: t('align.squareTip'), icon: <Square /> },
  { type: 'hex-vertical', label: t('align.pointy'), tooltip: t('align.pointyTip'), icon: <Hexagon /> },
  { type: 'hex-horizontal', label: t('align.flat'), tooltip: t('align.flatTip'), icon: <Hexagon className="atlas-grid-alignment-icon--flat" /> },
];

interface GridTypePickerProps {
  value: GridType;
  onChange: (type: GridType) => void;
}

/** The grid alignment panel's choice of grid: squares, pointy-top hexes or flat-top hexes. */
export function GridTypePicker({ value, onChange }: GridTypePickerProps): React.ReactElement {
  return (
    <div className="atlas-grid-alignment-tabs" role="radiogroup" aria-label={t('align.gridType')}>
      {GRID_TYPE_CHOICES.map(choice => (
        <LabelTooltip key={choice.type} label={choice.tooltip} describe>
          <button
            role="radio"
            aria-checked={value === choice.type}
            className={`atlas-grid-alignment-tab${value === choice.type ? ' is-active' : ''}`}
            onClick={() => onChange(choice.type)}
          >
            {choice.icon}
            {choice.label}
          </button>
        </LabelTooltip>
      ))}
    </div>
  );
}
