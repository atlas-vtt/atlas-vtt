import { useCallback, useEffect, useRef, useState } from 'react';

export interface FocusRequests {
  /** The ref callback of the element known by `key`. */
  register: (key: string) => (element: HTMLElement | null) => void;
  /** Focuses the element known by `key` once the next render has drawn it; a text field also has its text selected. */
  request: (key: string) => void;
}

/**
 * Focus that moves to an element an edit is about to draw (a new step's prompt, the action next
 * to one removed): it is asked for by key and given once the element is there.
 */
export function useFocusRequests(): FocusRequests {
  const elements = useRef(new Map<string, HTMLElement>());
  const [wanted, setWanted] = useState<string | null>(null);

  useEffect(() => {
    if (wanted === null) return;
    const element = elements.current.get(wanted);
    element?.focus({ preventScroll: true });
    // By tag, not `instanceof`: a popout window's elements are not this window's classes
    if (element?.tagName === 'INPUT') (element as HTMLInputElement).select();
    setWanted(null);
  }, [wanted]);

  const register = useCallback((key: string) => (element: HTMLElement | null): void => {
    if (element) elements.current.set(key, element);
    else elements.current.delete(key);
  }, []);

  return { register, request: setWanted };
}
