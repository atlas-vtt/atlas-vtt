import React from 'react';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../../packages/components/primitives/Skeleton';
import { t } from '../../../i18n';

const ROWS = 5;

/** The window's body while the collection's tables are read for the first time: its sidebar, bar and cards. */
export function TablesSkeleton(): React.ReactElement {
  return (
    <SkeletonGroup label={t('tables.loading')} className="atlas-loot-roller__body atlas-tables-skeleton">
      <div className="atlas-loot-roller__sidebar">
        <div className="atlas-tables-sidebar">
          <Skeleton className="atlas-tables-skeleton__search" />
          <div className="atlas-tables-group">
            <Skeleton shape="text" width="30%" className="atlas-loot-section-label" />
            {Array.from({ length: ROWS }, (_, index) => (
              <span key={index} className="atlas-tables-row">
                <Skeleton shape="text" width={skeletonTextWidth(index, 80)} />
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="atlas-loot-roller__main">
        <Skeleton className="atlas-tables-skeleton__bar" />
        <Skeleton className="atlas-tables-skeleton__bar" />
        <div className="atlas-loot-list__cards">
          <Skeleton className="atlas-tables-skeleton__card" />
          <Skeleton className="atlas-tables-skeleton__card" />
        </div>
      </div>
    </SkeletonGroup>
  );
}
