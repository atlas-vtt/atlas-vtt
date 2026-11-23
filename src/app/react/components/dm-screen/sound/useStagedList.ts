import { startTransition, useEffect, useState } from 'react';

/**
 * The items of a long list to mount: as many as were mounted before, or `first`, at once; the rest in a transition
 * right after, which React renders in slices between frames. Opening the page, or a change that brings back hundreds
 * of items (a search cleared, a walk that found many tags), never mounts them all in one frame. `first` must cover
 * what any screen shows of the list before it is scrolled.
 */
export function useStagedList<T>(items: readonly T[], first: number): readonly T[] {
  const [limit, setLimit] = useState(first);
  const wanted = items.length;
  useEffect(() => {
    if (limit < wanted) startTransition(() => setLimit(wanted));
    else if (limit > Math.max(wanted, first)) setLimit(Math.max(wanted, first));
  }, [limit, wanted, first]);
  return wanted <= limit ? items : items.slice(0, limit);
}
