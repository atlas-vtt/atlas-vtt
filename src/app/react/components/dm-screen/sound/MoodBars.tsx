import React, { useContext, useEffect, useRef } from 'react';
import { MeterBoardContext } from './VerticalFader';

/** The playing tile's four bars, which go with the whole mix, drawn by the page's meter loop; still while the mix is held. */
export function MoodBars({ still }: { still: boolean }): React.JSX.Element {
  const board = useContext(MeterBoardContext);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const bars = [...(root.current?.querySelectorAll('i') ?? [])];
    if (!still) return board.addBars(bars);
    // Held: flat, as the stylesheet draws them, not where the last level left them.
    for (const bar of bars) bar.style.removeProperty('transform');
    return undefined;
  }, [board, still]);
  return <span className="atlas-sound-bars" ref={root} aria-hidden="true"><i /><i /><i /><i /></span>;
}
