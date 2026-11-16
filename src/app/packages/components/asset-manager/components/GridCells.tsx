import React, { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AnyAsset } from '../types';
import { cellVariants, enterTransition, hiddenCell, moveTransition, shownCell } from './gridMotion';

export const CELL_CLASS = 'atlas-asset-grid-cell';

/** What the grid tells a card about its place: the one tab stop, and where it stands in the whole list. */
export interface CardSlot {
  tabbable: boolean;
  /** 1-based. */
  position: number;
  setSize: number;
}

/** A card the grid mounts, with its cell. */
export interface PlacedAsset {
  asset: AnyAsset;
  column: number;
  row: number;
  /** The row's top within the grid. */
  y: number;
}

interface GridCellsProps {
  placed: readonly PlacedAsset[];
  renderCard: (asset: AnyAsset, slot: CardSlot) => React.ReactNode;
  tabbableId: string | null;
  setSize: number;
  columns: number;
  cardWidth: number;
  pitchX: number;
  /** The list itself changed (filter, sort, new assets), not only the rows in view: new cards fade in, the rest glide. */
  listChanged: boolean;
  /** The ids of the cards that were on screen before this list, which do not fade in again. */
  shownIds: React.RefObject<ReadonlySet<string>>;
  /** The first row in view, from which new cards are staggered. */
  firstVisibleRow: number;
  still: boolean;
}

/**
 * The mounted cards of the virtual grid. Memoised, so a render of the grid that only follows the scroll position
 * (the virtualizer's, between the renders that mount new rows) passes the cards by.
 */
export const GridCells = memo(function GridCells({
  placed, renderCard, tabbableId, setSize, columns, cardWidth, pitchX, listChanged, shownIds, firstVisibleRow, still,
}: GridCellsProps): React.JSX.Element {
  return (
    // Without `presenceAffectsLayout` a render tells only the cards that leave, not the subtree of every card.
    <AnimatePresence custom={listChanged} presenceAffectsLayout={false}>
      {placed.map(({ asset, column, row, y }) => {
        const slot: CardSlot = { tabbable: asset.id === tabbableId, position: row * columns + column + 1, setSize };
        const x = column * pitchX;
        const entering = listChanged && !shownIds.current.has(asset.id);
        return (
          <motion.div
            key={asset.id}
            className={CELL_CLASS}
            style={{ width: cardWidth }}
            initial={entering ? hiddenCell(x, y, still) : false}
            animate={shownCell(x, y)}
            variants={cellVariants(x, y, still)}
            exit="exit"
            transition={entering ? enterTransition(row - firstVisibleRow + column, still) : moveTransition(listChanged, still)}
          >
            {renderCard(asset, slot)}
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
});
