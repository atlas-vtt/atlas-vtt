import React, { useContext, useEffect, useRef } from 'react';
import { MeterBoardContext } from './VerticalFader';

/** The playing tile's four bars, which go with the whole mix, drawn by the page's meter loop. */
export function MoodBars(): React.JSX.Element {
  const board = useContext(MeterBoardContext);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => (root.current ? board.addBars([...root.current.querySelectorAll('i')]) : undefined), [board]);
  return <span className="atlas-sound-bars" ref={root} aria-hidden="true"><i /><i /><i /><i /></span>;
}
