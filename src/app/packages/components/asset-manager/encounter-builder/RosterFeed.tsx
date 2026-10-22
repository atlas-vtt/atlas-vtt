import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { StatblockFeeds } from '../../../../react/components/dm-screen/StatblockFeeds';
import { observeResize } from '../../../../utils/observeResize';
import type { TokenAsset } from '../types';
import { CreatureCard } from './CreatureCard';
import { flashCard } from './flashCard';

interface RosterFeedProps {
  app: App;
  creatures: readonly TokenAsset[];
  /** Changes whenever the search or a filter does. */
  refinement: string;
  countOf: (tokenId: string) => number;
  onCountChange: (token: TokenAsset, count: number) => void;
  /** A creature whose statblock to scroll into view and mark; a new `nonce` asks again for the same one. */
  reveal: { id: string; nonce: number } | null;
}

/** Statblocks drawn at first and added each time the feed nears its end: a collection can hold hundreds, each a full card. */
const PAGE = 12;
/** How far below the visible end the next statblocks are drawn, in pixels. */
const AHEAD = 1200;

/**
 * The collection's creatures as the DM screen shows statblocks: full cards in feeds side by side,
 * as many as the width holds.
 */
export function RosterFeed({ app, creatures, refinement, countOf, onCountChange, reveal }: RosterFeedProps): React.JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(PAGE);
  const shown = creatures.slice(0, limit);
  const more = creatures.length > limit;

  // Another search starts at the top again with the first page.
  useLayoutEffect(() => {
    setLimit(PAGE);
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [refinement]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !more) return undefined;
    const fill = (): void => {
      if (scroller.scrollTop + scroller.clientHeight + AHEAD >= scroller.scrollHeight) setLimit((current) => current + PAGE);
    };
    // The resize observer's first call fills the pane once the drawn statblocks have their heights.
    scroller.addEventListener('scroll', fill, { passive: true });
    const content = scroller.firstElementChild;
    const stopObserving = observeResize(content ? [scroller, content] : [scroller], fill);
    return () => {
      scroller.removeEventListener('scroll', fill);
      stopObserving();
    };
  }, [more, limit]);

  // A statblock asked for is drawn first if it lies past the drawn ones, then scrolled to once placed.
  const revealed = useRef(0);
  useEffect(() => {
    if (!reveal || revealed.current === reveal.nonce) return undefined;
    const index = creatures.findIndex((token) => token.id === reveal.id);
    if (index < 0) return undefined;
    if (index >= limit) {
      setLimit(Math.ceil((index + 1) / PAGE) * PAGE);
      return undefined;
    }
    const win = scrollerRef.current?.win ?? window;
    // Two frames: the feed measures and places the newly drawn statblocks in the first.
    let frame = win.requestAnimationFrame(() => {
      frame = win.requestAnimationFrame(() => {
        const card = scrollerRef.current?.querySelector<HTMLElement>(`[data-token-id="${CSS.escape(reveal.id)}"]`);
        if (!card) return;
        // Marked done only once it is shown: a search cleared for it resets the drawn statblocks on the way.
        revealed.current = reveal.nonce;
        const still = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
        card.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
        flashCard(card);
      });
    });
    return () => win.cancelAnimationFrame(frame);
  }, [reveal, creatures, limit]);

  return (
    <div ref={scrollerRef} className="atlas-encounter-builder__feed">
      <StatblockFeeds>
        {shown.map((token) => (
          <CreatureCard key={token.id} app={app} token={token} count={countOf(token.id)} onCountChange={onCountChange} />
        ))}
      </StatblockFeeds>
    </div>
  );
}
