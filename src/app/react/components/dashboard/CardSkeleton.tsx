import React from 'react';
import { Skeleton } from '../../../packages/components/primitives/Skeleton';

/** A dashboard card's placeholder, in the card's own shape (`className` names the kind of card). */
export function CardSkeleton({ className }: { className: string }): React.JSX.Element {
  return (
    <div className={`dashboard-card ${className}`}>
      <Skeleton className="dashboard-card__art" />
      <span className="dashboard-card__body">
        <span className="dashboard-card__text">
          <span className="dashboard-card__title"><Skeleton shape="text" width="62%" /></span>
          <span className="dashboard-card__meta"><Skeleton shape="text" width="44%" /></span>
        </span>
      </span>
    </div>
  );
}
