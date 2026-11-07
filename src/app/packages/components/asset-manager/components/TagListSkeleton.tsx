import React from 'react';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../primitives/Skeleton';

const ROWS = 5;

/** Stands in for the sidebar's tags while the collection's are loaded: rows in the shape of a tag button. */
export function TagListSkeleton(): React.JSX.Element {
  return (
    <SkeletonGroup label="Loading tags">
      {Array.from({ length: ROWS }, (_, index) => (
        <div key={index} className="atlas-tag-skeleton">
          <Skeleton className="atlas-tag-skeleton__icon" />
          <span className="atlas-tag-skeleton__name"><Skeleton shape="text" width={skeletonTextWidth(index, 70)} /></span>
        </div>
      ))}
    </SkeletonGroup>
  );
}
