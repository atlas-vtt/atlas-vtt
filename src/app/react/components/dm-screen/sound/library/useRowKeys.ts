import type React from 'react';
import { entryOfRow, selectionAfter, type LibraryRow as Row } from './rowModel';
import type { LibraryActions } from './useLibraryActions';

const PAGE_ROWS = 10;

interface RowKeysOptions {
  rows: readonly Row[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  selected: ReadonlySet<string>;
  setSelected: (selected: ReadonlySet<string>) => void;
  anchor: string | null;
  setAnchor: (anchor: string | null) => void;
  scrollTo: (index: number) => void;
  actions: LibraryActions;
  primary: (row: Row) => void;
  inHand: (row: Row) => Row[];
  setRenaming: (id: string | null) => void;
  openMenu: (row: Row, at: { x: number; y: number }, anchor: HTMLElement | null) => void;
  list: React.RefObject<HTMLElement | null>;
}

/** The list's keys: arrows and Home and End move, Shift extends, Enter is the row's primary action, Space previews, Delete asks, F2 renames. */
export function useRowKeys({ rows, activeIndex, setActiveIndex, selected, setSelected, anchor, setAnchor, scrollTo, actions, primary, inHand, setRenaming, openMenu, list }: RowKeysOptions): (event: React.KeyboardEvent) => void {
  const moveActive = (index: number, extend: boolean): void => {
    const next = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[next];
    if (!row) return;
    setActiveIndex(next);
    scrollTo(next);
    if (extend) {
      const from = anchor ?? rows[activeIndex]?.id ?? row.id;
      setSelected(selectionAfter(rows, selected, from, row.id, { toggle: false, range: true }).selected);
      setAnchor(from);
    } else {
      setSelected(new Set([row.id]));
      setAnchor(row.id);
    }
  };

  const onRow = (row: Row, event: React.KeyboardEvent): void => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (mod && row.type === 'file' && row.file.kind === 'music') actions.toMix([row.file], 'now');
      else primary(row);
    } else if (event.key === ' ') {
      event.preventDefault();
      if (row.type === 'file') actions.preview(row.file);
    } else if (event.key === 'Delete' || (event.key === 'Backspace' && mod)) {
      event.preventDefault();
      if (row.type === 'waiting') actions.forget(row.sound);
      else actions.remove(inHand(row).flatMap((one) => entryOfRow(one) ?? []));
    } else if (event.key === 'F2') {
      event.preventDefault();
      if (row.type !== 'waiting') setRenaming(row.id);
    } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      const box = list.current?.querySelector('[data-active="true"]')?.getBoundingClientRect();
      openMenu(row, { x: (box?.left ?? 0) + 40, y: box?.bottom ?? 0 }, list.current);
    }
  };

  return (event) => {
    const take = (index: number): void => {
      event.preventDefault();
      moveActive(index, event.shiftKey);
    };
    switch (event.key) {
      case 'ArrowDown': take(activeIndex + 1); return;
      case 'ArrowUp': take(activeIndex - 1); return;
      case 'Home': take(0); return;
      case 'End': take(rows.length - 1); return;
      case 'PageDown': take(activeIndex + PAGE_ROWS); return;
      case 'PageUp': take(activeIndex - PAGE_ROWS); return;
      case 'a':
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          setSelected(new Set(rows.map((one) => one.id)));
        }
        return;
      case 'Escape':
        if (selected.size > 0) {
          event.stopPropagation();
          setSelected(new Set());
        }
        return;
      default: {
        const row = rows[activeIndex];
        if (row) onRow(row, event);
      }
    }
  };
}
