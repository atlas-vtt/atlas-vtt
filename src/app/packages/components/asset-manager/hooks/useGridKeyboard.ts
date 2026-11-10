import type * as React from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { AnyAsset, SelectionEvent } from '../types';
import { nextGridIndex } from '../utils/gridNavigation';
import { focusSoon } from '../utils/cardFocus';
import { isTextEntryTarget } from '../../../../keyboard/textEntry';
import type { GridReveal } from './useRevealMoved';

const CARD = '[data-asset-id]';

/**
 * Reveals already carried out, by any grid: a grid mounts anew whenever its list empties and fills again (typing a
 * search), and one that kept this per instance focused a card revealed long ago, taking focus and keys from the search.
 */
const doneReveals = new WeakSet<GridReveal>();

export interface GridKeyboardDeps {
  assets: readonly AnyAsset[];
  columns: number;
  /** Rows a page holds, for Page Up and Page Down. */
  pageRows: number;
  container: React.RefObject<HTMLElement | null>;
  /** Brings an unmounted row into view, so its card mounts and can take focus. */
  scrollToRow: (row: number) => void;
  /** Selects as a click with these keys would: Shift+arrows extend the selection from its anchor. */
  onSelect: (assetId: string, event?: SelectionEvent) => void;
  /** A card to bring into view and focus once it is in the list (where a move notice's button took the GM). */
  reveal?: GridReveal | null | undefined;
}

export interface GridKeyboard {
  /** The grid's one tab stop: the card focus was on last, else the first. */
  tabbableId: string | null;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLElement>) => void;
}

function cardOf(target: EventTarget | null): HTMLElement | null {
  const node = target as Node | null;
  return node?.instanceOf?.(HTMLElement) ? node.closest<HTMLElement>(CARD) : null;
}

function cardById(container: HTMLElement | null, id: string): HTMLElement | null {
  return Array.from(container?.querySelectorAll<HTMLElement>(CARD) ?? []).find((card) => card.dataset.assetId === id) ?? null;
}

/**
 * Roving focus over the virtual asset grid (WAI-ARIA listbox): the arrows move
 * focus card by card and row by row, Home and End to the ends, Page Up and Down
 * a page; Shift with them extends the selection. A card that is not mounted is
 * scrolled to first and focused once it mounts.
 */
export function useGridKeyboard({ assets, columns, pageRows, container, scrollToRow, onSelect, reveal }: GridKeyboardDeps): GridKeyboard {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  // Focus that no key of the grid asked for opens no tooltip (`focusSoon`).
  const pendingQuiet = useRef(false);

  // Before the focus below, which then takes a card already mounted in the same commit.
  useLayoutEffect(() => {
    if (!reveal || doneReveals.has(reveal) || columns < 1) return;
    const index = assets.findIndex((asset) => asset.id === reveal.id);
    if (index === -1) return;
    doneReveals.add(reveal);
    setFocusedId(reveal.id);
    pendingFocus.current = reveal.id;
    pendingQuiet.current = true;
    scrollToRow(Math.floor(index / columns));
  }, [reveal, assets, columns]);

  useLayoutEffect(() => {
    const id = pendingFocus.current;
    const card = id ? cardById(container.current, id) : null;
    if (!card) return;
    pendingFocus.current = null;
    // A reveal comes from a notice's button: focus the GM has since put in a text field (the search) stays there.
    const doc = card.ownerDocument;
    if (pendingQuiet.current) focusSoon(doc, () => card, () => !isTextEntryTarget(doc.activeElement));
    else card.focus({ preventScroll: true });
    pendingQuiet.current = false;
  });

  const tabbableId = assets.some((asset) => asset.id === focusedId) ? focusedId : assets[0]?.id ?? null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const card = cardOf(event.target);
    const index = card ? assets.findIndex((asset) => asset.id === card.dataset.assetId) : -1;
    if (!card || index === -1) return;
    const next = nextGridIndex(index, event, columns, assets.length, pageRows);
    if (next === null || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    const target = assets[next]!;
    if (event.shiftKey) {
      // The selection grows from the card focus leaves, which a first Shift+arrow selects.
      if (card.getAttribute('aria-selected') !== 'true') onSelect(card.dataset.assetId!);
      onSelect(target.id, event);
    }
    setFocusedId(target.id);
    const mounted = cardById(container.current, target.id);
    if (mounted) {
      mounted.focus();
      return;
    }
    pendingFocus.current = target.id;
    pendingQuiet.current = false;
    scrollToRow(Math.floor(next / columns));
  };

  const onFocus = (event: React.FocusEvent<HTMLElement>): void => {
    const id = cardOf(event.target)?.dataset.assetId;
    if (id) setFocusedId(id);
  };

  return { tabbableId, onKeyDown, onFocus };
}
