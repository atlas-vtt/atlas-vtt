import React from 'react';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../../packages/components/primitives/Skeleton';
import './statblock-skeleton.scss';

const STAT_COLUMNS = 6;
const TEXT_LINES = 5;

interface StatblockSkeletonProps {
  /** The class its statblock takes, so the placeholder gets the same place. */
  className?: string | undefined;
}

/**
 * Stands in for a statblock that is being read, inside the card the statblock
 * will have: its name and type, the row of abilities and a few lines of traits.
 */
export function StatblockSkeleton({ className }: StatblockSkeletonProps): React.JSX.Element {
  return (
    <div className={`atlas-fantasy-statblock ${className ?? ''}`}>
      <div className="atlas-statblock">
        <div className="atlas-statblock-body">
          <StatblockSkeletonBody />
        </div>
      </div>
    </div>
  );
}

function StatblockSkeletonBody(): React.JSX.Element {
  return (
    <SkeletonGroup label="Loading statblock…" className="atlas-statblock-skeleton">
      <div className="atlas-statblock-skeleton__heading">
        <Skeleton shape="text" width="48%" className="atlas-statblock-skeleton__name" />
        <Skeleton shape="text" width="32%" />
      </div>
      <Skeleton className="atlas-statblock-skeleton__rule" />
      <div className="atlas-statblock-skeleton__lines">
        <Skeleton shape="text" width="40%" />
        <Skeleton shape="text" width="54%" />
        <Skeleton shape="text" width="36%" />
      </div>
      <div className="atlas-statblock-skeleton__stats">
        {Array.from({ length: STAT_COLUMNS }, (_, index) => <Skeleton key={index} className="atlas-statblock-skeleton__stat" />)}
      </div>
      <Skeleton className="atlas-statblock-skeleton__rule" />
      <div className="atlas-statblock-skeleton__lines">
        {Array.from({ length: TEXT_LINES }, (_, index) => <Skeleton key={index} shape="text" width={skeletonTextWidth(index + 1, 120)} />)}
      </div>
    </SkeletonGroup>
  );
}
