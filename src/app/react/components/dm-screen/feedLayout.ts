/**
 * Layout of the DM screen's statblocks: feeds (columns) that share the pane's width, filled like
 * a masonry wall. The pane's measured width alone decides how many feeds there are and how wide
 * they are, so feeds can never wrap below each other.
 */

import { STATBLOCK_FEED_MAX_WIDTH, STATBLOCK_FEED_MIN_WIDTH } from '../../../statblocks/render/statblockSurfaceWidths';

/** Space between feeds and between the statblocks of one feed, in pixels. */
export const FEED_GAP = 12;
/** A statblock narrower than this becomes hard to read. */
export const MIN_FEED_WIDTH = STATBLOCK_FEED_MIN_WIDTH;
/** A statblock wider than this only spreads its text out. */
export const MAX_FEED_WIDTH = STATBLOCK_FEED_MAX_WIDTH;

export interface FeedLayout {
  count: number;
  width: number;
}

/** How many feeds fit into the pane and how wide each one is. */
export function feedLayout(paneWidth: number, statblockCount: number): FeedLayout {
  if (paneWidth <= 0) return { count: 1, width: MIN_FEED_WIDTH };
  const fitting = Math.floor((paneWidth + FEED_GAP) / (MIN_FEED_WIDTH + FEED_GAP));
  const count = Math.max(1, Math.min(fitting, statblockCount));
  const share = Math.floor((paneWidth - (count - 1) * FEED_GAP) / count);
  return { count, width: Math.min(share, MAX_FEED_WIDTH) };
}

export interface FeedPlacement {
  feed: number;
  top: number;
}

export interface FeedPlacements {
  placements: FeedPlacement[];
  /** Height of the tallest feed. */
  height: number;
}

/**
 * Places each statblock, in order, into the feed that has the first free space: the shortest
 * one, the leftmost among equals. Unmeasured statblocks (height 0) still take turns, because
 * every statblock claims the gap below it.
 */
export function placeInFeeds(heights: readonly number[], feedCount: number): FeedPlacements {
  const bottoms = new Array<number>(Math.max(1, feedCount)).fill(0);
  const placements = heights.map((height): FeedPlacement => {
    const feed = bottoms.indexOf(Math.min(...bottoms));
    const top = bottoms[feed] ?? 0;
    bottoms[feed] = top + height + FEED_GAP;
    return { feed, top };
  });
  const height = heights.length === 0 ? 0 : Math.max(...bottoms) - FEED_GAP;
  return { placements, height };
}
