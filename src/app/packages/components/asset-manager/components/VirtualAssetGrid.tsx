import React, { startTransition, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReducedMotion } from 'framer-motion';
import type { AnyAsset, SelectionEvent } from '../types';
import { useGridMetrics } from './useGridMetrics';
import { CELL_CLASS, GridCells, type CardSlot, type PlacedAsset } from './GridCells';
import { cardMask, measureCard, sameCardLayout, unmountedRegions, type CardLayout } from './gridSkeleton';
import { useGridKeyboard } from '../hooks/useGridKeyboard';
import type { GridReveal } from '../hooks/useRevealMoved';

/** Name row, paddings and inner gap below the square artwork, until a card has been measured. */
const CARD_EXTRA_HEIGHT = 44;
/**
 * The measured height below the artwork per asset type, kept across mounts so a
 * grid shown again (another tab, folder or search) lays its rows out right from
 * its first frame instead of shifting them once a card is measured.
 */
const cardExtraHeights = new Map<AnyAsset['type'], number>();
/** The card layout last measured per asset type, so a grid's placeholders show before its own cards are measured. */
const cardLayouts = new Map<AnyAsset['type'], CardLayout>();
const OVERSCAN_ROWS = 2;

/** How far a grid has mounted its cards: none, the rows in view, then the rows around them as well. */
type MountStage = 'frame' | 'inView' | 'all';
const NEXT_STAGE: Record<MountStage, MountStage> = { frame: 'inView', inView: 'all', all: 'all' };

/**
 * A grid mounts in steps, each in a transition of its own after the one before has been committed, which React
 * renders in slices between frames: first without cards (it measures itself and its scroller, which renders it again
 * within the same commit), then the cards in view, then the rows around them. Mounted at once, the cards and that
 * measuring made the window's open hold one frame of 30 to 40 ms.
 */
function useMountStage(): MountStage {
  const [stage, setStage] = useState<MountStage>('frame');
  useEffect(() => {
    if (stage !== 'all') startTransition(() => setStage(NEXT_STAGE[stage]));
  }, [stage]);
  return stage;
}

export type { CardSlot } from './GridCells';

export interface VirtualAssetGridProps {
  assets: AnyAsset[];
  /**
   * The scrolling ancestor; the grid may sit below other content inside it.
   * Passed as state rather than a ref because an ancestor's ref is attached
   * only after this component's layout effects have run.
   */
  scrollElement: HTMLElement | null;
  renderCard: (asset: AnyAsset, slot: CardSlot) => React.ReactNode;
  onBackgroundClick: (event: React.MouseEvent) => void;
  /** The listbox's name for assistive tech: what the cards are (the tab's name). */
  label: string;
  /** Selects as a click with these keys would (Shift+arrows). */
  onSelect: (assetId: string, event?: SelectionEvent) => void;
  /** Animates the first cards in, for a grid that mounts into content already on screen. */
  appear?: boolean;
  /** A card to bring into view and focus once (`useGridKeyboard`). */
  reveal?: GridReveal | null | undefined;
}

/**
 * Asset grid that only mounts the rows in and around the viewport, so the
 * cost of the library stays flat however many assets it holds.
 *
 * Every card is a direct child placed by its own transform, so a card keeps
 * its element when the order changes and can glide to its new cell. Cards
 * that mount because the list changed fade in; cards that mount because the
 * user scrolled appear as they are.
 *
 * Scrolling is drawn before the grid renders again, so the rows around the
 * mounted ones show placeholders: one masked element per stretch, tiled with a
 * card's shape, which costs nothing while it scrolls. The rows that come into
 * reach mount in a deferred render (`useDeferredValue`), which React does in
 * slices between frames and drops for a newer one while the scroll goes on;
 * rendered in the scroll event (the virtualizer's `flushSync`), each new row
 * cost the frame it arrived in (round 8, `grid-scroll-fast`).
 */
export function VirtualAssetGrid({
  assets, scrollElement, renderCard, onBackgroundClick, label, onSelect, appear = false, reveal,
}: VirtualAssetGridProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const still = useReducedMotion() === true;
  const { columns, gap, cardWidth } = useGridMetrics(containerRef);
  const assetType = assets[0]?.type;
  const [extraHeight, setExtraHeight] = useState(() => (assetType && cardExtraHeights.get(assetType)) ?? CARD_EXTRA_HEIGHT);
  const [cardLayout, setCardLayout] = useState<CardLayout | null>(() => (assetType && cardLayouts.get(assetType)) ?? null);
  const stage = useMountStage();
  const cardsMounted = stage !== 'frame';
  const rowHeight = cardWidth + extraHeight;
  const rowPitch = rowHeight + gap;

  const virtualizer = useVirtualizer({
    count: Math.ceil(assets.length / columns),
    getScrollElement: () => scrollElement,
    estimateSize: () => rowHeight,
    overscan: stage === 'all' ? OVERSCAN_ROWS : 0,
    gap,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    useFlushSync: false,
  });

  // Every row is as tall as a card; drop the sizes computed for the previous height.
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const pageRows = Math.max(1, Math.floor((scrollElement?.clientHeight ?? 0) / Math.max(1, rowHeight + gap)));
  const keyboard = useGridKeyboard({
    assets, columns, container: containerRef, onSelect, reveal, pageRows,
    scrollToRow: (row) => virtualizer.scrollToIndex(row, { align: 'auto' }),
  });

  const rows = virtualizer.getVirtualItems();
  const scrollMargin = virtualizer.options.scrollMargin;
  // The rows mounted: those in reach as of the last render React finished; the placeholders stand in the others.
  const firstRow = useDeferredValue(rows[0]?.index ?? null);
  const lastRow = useDeferredValue(rows[rows.length - 1]?.index ?? null);

  const listKey = useMemo(() => assets.map((asset) => asset.id).join('\n'), [assets]);
  const settledListKey = useRef<string | null>(appear ? null : listKey);
  const shownIds = useRef<ReadonlySet<string>>(new Set());
  const listChanged = settledListKey.current !== listKey;
  const firstVisibleRow = rowPitch > 0 ? Math.floor(((virtualizer.scrollOffset ?? 0) - scrollMargin) / rowPitch) : 0;

  const visibleAssets = useMemo((): PlacedAsset[] => {
    if (!cardsMounted || firstRow === null || lastRow === null) return [];
    const placed: PlacedAsset[] = [];
    for (let row = firstRow; row <= lastRow; row++) {
      assets.slice(row * columns, (row + 1) * columns).forEach((asset, column) => placed.push({ asset, column, row, y: row * rowPitch }));
    }
    return placed;
  }, [cardsMounted, firstRow, lastRow, assets, columns, rowPitch]);

  useEffect(() => {
    shownIds.current = new Set(visibleAssets.map(({ asset }) => asset.id));
    // A list is settled once it has been on screen; the first render has no scroll element yet.
    if (visibleAssets.length > 0 || assets.length === 0) settledListKey.current = listKey;
  });

  // Cards of one type share a height; measure it once one is on screen.
  const hasCards = visibleAssets.length > 0;
  useLayoutEffect(() => {
    const card = containerRef.current?.querySelector<HTMLElement>(`.${CELL_CLASS}`);
    if (!card?.offsetHeight || !assetType) return;
    const measured = card.offsetHeight - cardWidth;
    cardExtraHeights.set(assetType, measured);
    setExtraHeight(measured);
    const layout = measureCard(card);
    if (layout) cardLayouts.set(assetType, layout);
    setCardLayout((previous) => (sameCardLayout(previous, layout) ? previous : layout));
  }, [cardWidth, hasCards, assetType]);

  const pitchX = cardWidth + gap;
  const mask = cardLayout && assetType ? cardMask(assetType, cardLayout, cardWidth, pitchX, rowPitch) : undefined;
  const maskSize = `${pitchX}px ${rowPitch}px`;
  // Until the cards mount, the rows they will fill show placeholders as well: no row counts as mounted.
  const rest = mask ? unmountedRegions({
    firstRow,
    lastRow: cardsMounted || firstRow === null ? lastRow : firstRow - 1,
    assetCount: assets.length, columns, pitchX, pitchY: rowPitch, gap,
  }) : [];

  return (
    <div
      ref={containerRef}
      className="atlas-asset-grid-virtual"
      style={{ height: virtualizer.getTotalSize() }}
      onClick={onBackgroundClick}
      role="listbox"
      aria-label={label}
      aria-multiselectable="true"
      aria-orientation="vertical"
      onKeyDown={keyboard.onKeyDown}
      onFocus={keyboard.onFocus}
    >
      {rest.map(({ row, ...box }) => (
        <div
          key={row}
          className="atlas-asset-grid-rest"
          style={{ ...box, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: maskSize, maskSize }}
          aria-hidden="true"
        />
      ))}
      <GridCells
        placed={visibleAssets}
        renderCard={renderCard}
        tabbableId={keyboard.tabbableId}
        setSize={assets.length}
        columns={columns}
        cardWidth={cardWidth}
        pitchX={pitchX}
        listChanged={listChanged}
        shownIds={shownIds}
        // Read only for cards that enter with a new list; a constant otherwise, so scrolling passes the cards by.
        firstVisibleRow={listChanged ? firstVisibleRow : 0}
        still={still}
      />
    </div>
  );
}
