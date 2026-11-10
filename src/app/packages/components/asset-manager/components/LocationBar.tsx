import React from 'react';
import { Breadcrumb, type BreadcrumbProps } from './Breadcrumb';
import { SortControls, type SortControlsProps } from './SortControls';

export interface LocationBarProps extends BreadcrumbProps {
  sort: SortControlsProps;
}

/** The row above the content: where the open folder lies, and how its assets are sorted. */
export function LocationBar({ sort, ...breadcrumb }: LocationBarProps): React.JSX.Element {
  return (
    <div className="atlas-asset-manager-location">
      <Breadcrumb {...breadcrumb} />
      <SortControls {...sort} />
    </div>
  );
}
