import { useEffect, useRef, useState } from 'react';

/**
 * What a live region should say of `text`: the text once it has rested `restMs`, and only when it differs
 * from what was said last, so a line that changes with every keystroke (a formula refused while it is typed)
 * is spoken once typing pauses and not again while it stands. The text the region starts with is not spoken.
 */
export function useSpokenOnce(text: string, restMs: number): string {
  const [spoken, setSpoken] = useState('');
  const said = useRef(text);
  useEffect(() => {
    if (text === said.current) return undefined;
    const timer = window.setTimeout(() => {
      said.current = text;
      setSpoken(text);
    }, restMs);
    return () => window.clearTimeout(timer);
  }, [text, restMs]);
  return spoken;
}
