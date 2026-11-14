import type { GridKey } from '../utils/gridNavigation';

/** Where a card of the feeds lies, in any one coordinate space. */
export interface FeedBox {
  left: number;
  top: number;
  bottom: number;
}

/** Cards whose left edges lie closer than this stand in one feed. */
const SAME_FEED = 1;

function overlap(a: FeedBox, b: FeedBox): number {
  return Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
}

/** The card of the neighbouring feed beside `from`: the one sharing most of its height, else the nearest. */
function besideIn(boxes: readonly FeedBox[], from: FeedBox, step: 1 | -1): number | null {
  const lefts = [...new Set(boxes.map((box) => Math.round(box.left)))].sort((a, b) => a - b);
  const feed = lefts.findIndex((left) => Math.abs(left - from.left) < SAME_FEED);
  const target = lefts[feed + step];
  if (feed === -1 || target === undefined) return null;
  let best: number | null = null;
  let bestScore = -Infinity;
  boxes.forEach((box, index) => {
    if (Math.abs(box.left - target) >= SAME_FEED) return;
    const score = overlap(box, from);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** The card above or below `from` in its own feed. */
function inFeed(boxes: readonly FeedBox[], from: FeedBox, step: 1 | -1): number | null {
  let best: number | null = null;
  boxes.forEach((box, index) => {
    if (Math.abs(box.left - from.left) >= SAME_FEED) return;
    const ahead = step === 1 ? box.top > from.top : box.top < from.top;
    if (!ahead) return;
    const current = best === null ? null : boxes[best]!;
    if (!current || (step === 1 ? box.top < current.top : box.top > current.top)) best = index;
  });
  return best;
}

/**
 * Where focus goes among the creatures of the encounter builder's feeds, laid out side by side
 * as masonry, so neighbours are found by place, not by count: Up and Down step within a feed,
 * Left and Right to the card beside in the next feed, Page Up and Page Down to the previous and
 * next creature of the list (WAI-ARIA feed), Home and End to its ends. It stays put at an edge.
 * Null for any other key, or with a modifier.
 */
export function nextFeedIndex(boxes: readonly FeedBox[], index: number, event: GridKey): number | null {
  const from = boxes[index];
  if (!from || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const last = boxes.length - 1;
  const stay = (found: number | null): number => found ?? index;
  switch (event.key) {
    case 'ArrowDown': return stay(inFeed(boxes, from, 1));
    case 'ArrowUp': return stay(inFeed(boxes, from, -1));
    case 'ArrowRight': return stay(besideIn(boxes, from, 1));
    case 'ArrowLeft': return stay(besideIn(boxes, from, -1));
    case 'PageDown': return Math.min(index + 1, last);
    case 'PageUp': return Math.max(index - 1, 0);
    case 'Home': return 0;
    case 'End': return last;
    default: return null;
  }
}
