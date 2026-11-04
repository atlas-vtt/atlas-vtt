import React from 'react';
import type { GridType } from '../../grid/GridSystem';
import { SegmentedControl } from '../../packages/components/primitives/SegmentedControl';
import type { SegmentedOption } from '../../packages/components/primitives/SegmentedControl';
import { t } from '../../i18n';

const GRID_TYPES: readonly SegmentedOption<GridType>[] = [
  { value: 'square', label: t('align.square') },
  { value: 'hex-vertical', label: t('align.pointy') },
  { value: 'hex-horizontal', label: t('align.flat') },
];

interface GridTypePickerProps {
  value: GridType;
  onChange: (type: GridType) => void;
  /** Shown, but not to be chosen from right now. */
  disabled?: boolean;
}

/** The grid alignment panel's choice of grid: squares, pointy-top hexes or flat-top hexes. */
export function GridTypePicker({ value, onChange, disabled = false }: GridTypePickerProps): React.ReactElement {
  return <SegmentedControl value={value} options={GRID_TYPES} onChange={onChange} ariaLabel={t('align.gridType')} disabled={disabled} />;
}
