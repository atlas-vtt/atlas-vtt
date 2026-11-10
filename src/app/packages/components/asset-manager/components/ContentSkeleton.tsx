import React, { useLayoutEffect, useRef, useState } from 'react';
import type { Tab } from '../types';
import { getTabDisplayName } from '../types';
import { Skeleton, SkeletonGroup, skeletonTextWidth } from '../../primitives/Skeleton';
import { useScrollbarGutter } from '../../primitives/useScrollbarGutter';
import { ENCOUNTER_PREVIEW_COUNT, encounterPreviewStyle } from '../utils/encounterPreviewLayout';
import { useGridMetrics } from './useGridMetrics';
import { assetTypeOfTab } from '../utils/tabKinds';

export interface ContentSkeletonProps {
  tab: Tab;
  /** How many subfolders the open folder holds. */
  folderCount: number;
  /** How many assets the tab holds; null while that is not known. */
  assetCount: number | null;
}

function SectionHeaderSkeleton({ width }: { width: number }): React.JSX.Element {
  return <div className="atlas-section-header"><Skeleton shape="text" width={width} /></div>;
}

/** The art of a card as its tab draws it: a token's circle, an encounter's group of three, a map's picture. */
function ArtSkeleton({ tab }: { tab: Tab }): React.JSX.Element {
  if (tab !== 'encounters') return <Skeleton className="atlas-asset-card-art-skeleton" />;
  return (
    <>
      {Array.from({ length: ENCOUNTER_PREVIEW_COUNT }, (_, index) => (
        <Skeleton
          key={index}
          shape="circle"
          className="atlas-encounter-skeleton-portrait"
          style={encounterPreviewStyle(index, ENCOUNTER_PREVIEW_COUNT)}
        />
      ))}
    </>
  );
}

/**
 * Stands in for a pane whose assets are loading: the sections and cards of the
 * tab, laid out by the rules of the real grid so the content takes their place
 * without a shift. It shows as many cards as the tab holds, and a screenful
 * where that is not known yet.
 */
export function ContentSkeleton({ tab, folderCount, assetCount }: ContentSkeletonProps): React.JSX.Element {
  const [pane, setPane] = useState<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const { columns, gap, cardWidth } = useGridMetrics(gridRef);
  // One row to begin with: its card is measured, and the rows that fill the pane follow before the first paint.
  const [rows, setRows] = useState(1);
  useScrollbarGutter(pane);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    const card = grid?.firstElementChild;
    if (!pane || !grid || !card) return;
    const room = pane.getBoundingClientRect().bottom - grid.getBoundingClientRect().top;
    setRows(Math.max(1, Math.ceil(room / (card.getBoundingClientRect().height + gap))));
  }, [pane, cardWidth, gap, folderCount]);

  const screenful = rows * columns;
  const cards = assetCount === null ? screenful : Math.min(assetCount, screenful);
  const tabName = getTabDisplayName(tab);

  return (
    <SkeletonGroup
      ref={setPane}
      label={`Loading ${tabName.toLowerCase()}`}
      className="atlas-asset-manager-content atlas-content-skeleton"
    >
      <div className="atlas-content-sections">
        {folderCount > 0 && (
          <section className="atlas-content-section">
            <SectionHeaderSkeleton width={64} />
            <div className="atlas-folder-grid">
              {Array.from({ length: folderCount }, (_, index) => <Skeleton key={index} className="atlas-folder-skeleton" />)}
            </div>
          </section>
        )}
        <section className="atlas-content-section">
          <SectionHeaderSkeleton width={88} />
          <div ref={gridRef} className="atlas-asset-skeleton-grid">
            {Array.from({ length: cards }, (_, index) => (
              <div key={index} className="atlas-asset-card" data-type={assetTypeOfTab(tab)}>
                <div className="atlas-asset-card-thumb"><ArtSkeleton tab={tab} /></div>
                <span className="atlas-asset-card-name"><Skeleton shape="text" width={skeletonTextWidth(index, 80)} /></span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </SkeletonGroup>
  );
}
