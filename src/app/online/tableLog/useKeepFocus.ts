import { useLayoutEffect, type RefObject } from 'react';

/**
 * When an element of the panel leaves with the focus in it (a row cut from the list, a thread's pill
 * or bar once the view changes), the focus goes to what `heir` names from it, never to the page
 * behind the panel, whose shortcuts would take the next key. `heir` is one of the functions below,
 * or another that stays the same.
 */
export function useKeepFocus(element: RefObject<HTMLElement | null>, heir: (left: HTMLElement) => HTMLElement | null): void {
  useLayoutEffect(() => {
    const node = element.current;
    return () => {
      if (node?.contains(node.ownerDocument.activeElement) === true) heir(node)?.focus({ preventScroll: true });
    };
  }, [element, heir]);
}

/** The heir of most of the panel's elements: its list, which scrolls by the keyboard and holds the rows. */
export const toList = (left: HTMLElement): HTMLElement | null => left.closest('.atlas-online-log')?.querySelector<HTMLElement>('.atlas-online-log__list') ?? null;

/** The heir of an element in a row: the row, where it stays. */
export const toRow = (left: HTMLElement): HTMLElement | null => left.parentElement?.closest<HTMLElement>('[data-entry]') ?? null;
