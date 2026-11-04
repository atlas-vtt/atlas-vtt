import type React from 'react';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { HEADER_ROW, type CellAt } from '../../model/tableGrid';
import type { TableLook } from '../../render/blocks/ScoresView';
import type { ShownTable } from '../../render/values/shownTable';
import type { CaretStart } from './TableCellInput';
import type { TableCommand } from './tableCommands';
import type { TableAxis } from './TableDrag';
import { cellBeside, cellOver, stepCell, walkOf, type TableHost, type TableWalk } from './tableHost';

interface Selection {
  axis: TableAxis;
  index: number;
}

export interface TableKeysInput {
  host: TableHost;
  shown: ShownTable;
  look: TableLook;
  selected: Selection | null;
  setSelected: (selection: Selection | null) => void;
  open: (at: CellAt, caret?: CaretStart) => void;
  run: (command: TableCommand, then?: CellAt) => void;
  openMenu: (at: CellAt | Selection, point: { x: number; y: number }) => boolean;
  frameRef: React.RefObject<HTMLDivElement | null>;
}

export interface TableKeys {
  /** A key in the cell being typed; true where the table used it. */
  onCellKey: (event: React.KeyboardEvent<HTMLTextAreaElement>, input: HTMLTextAreaElement, at: CellAt) => boolean;
  /** A key on the table's frame, while a row or column is selected. */
  onFrameKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/** Whether the caret can go no further up (-1) or down (1) inside the field: its text takes one line, or it stands at that end. */
function atLineEdge(input: HTMLTextAreaElement, step: 1 | -1): boolean {
  const lineHeight = Number.parseFloat(input.win.getComputedStyle(input).lineHeight) || input.clientHeight;
  if (input.scrollHeight <= lineHeight * 1.5) return true;
  return step < 0 ? input.selectionEnd === 0 : input.selectionStart === input.value.length;
}

function menuPoint(element: Element | null): { x: number; y: number } {
  const box = element?.getBoundingClientRect();
  return box ? { x: box.left, y: box.bottom } : { x: 0, y: 0 };
}

/**
 * The keys of a Table typed in place, as Obsidian's table editor answers them:
 * Tab and Shift+Tab walk the cells (Tab past the last adds a row where rows
 * may be added, else goes on to the next value), Enter goes down a row
 * (adding one under the last), Shift+Enter up, the arrows cross a cell's edge
 * at the caret's end, Escape leaves, Shift+F10 or the Menu key opens the
 * cell's menu. A selected row or column is deleted by Delete or Backspace.
 */
export function useTableKeys({ host, shown, look, selected, setSelected, open, run, openMenu, frameRef }: TableKeysInput): TableKeys {
  const walk = (): TableWalk => walkOf(host.grid(), shown.header && look === 'grid', host.room);

  const tab = (at: CellAt, step: 1 | -1): void => {
    const next = stepCell(walk(), at, step);
    if (next) open(next);
    else if (step > 0 && host.room.rows && look === 'grid') run({ kind: 'insert-row', at: walk().rows }, { row: walk().rows, col: 0 });
    else host.exit(step);
  };

  const enter = (at: CellAt, step: 1 | -1): void => {
    // One row drawn as lines goes down its lines, which are its columns.
    const next = look === 'lines' ? cellBeside(walk(), at, step) : cellOver(walk(), at, step);
    if (next) open(next);
    else if (step > 0 && host.room.rows && look === 'grid' && at.row !== HEADER_ROW) run({ kind: 'insert-row', at: at.row + 1 }, { row: at.row + 1, col: at.col });
    else if (step > 0) host.close(true);
  };

  /** The arrows: out of the cell at the caret's end, into the neighbour; one row of lines goes up and down its columns. */
  const arrow = (event: React.KeyboardEvent<HTMLTextAreaElement>, input: HTMLTextAreaElement, at: CellAt): boolean => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return false;
    const collapsed = input.selectionStart === input.selectionEnd;
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    const step: 1 | -1 = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    if (!collapsed) return false;
    if (vertical) {
      if (!atLineEdge(input, step)) return false;
      const next = look === 'lines' ? cellBeside(walk(), at, step) : cellOver(walk(), at, step);
      if (next) open(next);
      return next !== null;
    }
    if (look === 'lines') return false;
    const atEdge = step < 0 ? input.selectionStart === 0 : input.selectionEnd === input.value.length;
    const next = atEdge ? cellBeside(walk(), at, step) : null;
    // Out of a cell's start into its neighbour's end, and out of its end into the neighbour's start, as text runs on.
    if (next) open(next, step < 0 ? 'end' : 0);
    return next !== null;
  };

  const onCellKey = (event: React.KeyboardEvent<HTMLTextAreaElement>, input: HTMLTextAreaElement, at: CellAt): boolean => {
    switch (event.key) {
      case 'Tab': tab(at, event.shiftKey ? -1 : 1); return true;
      case 'Enter':
        if (event.altKey || event.metaKey || event.ctrlKey) return false;
        enter(at, event.shiftKey ? -1 : 1);
        return true;
      case 'Escape':
        if (handledByAnotherControl(event.nativeEvent)) return false;
        host.close(true);
        return true;
      case 'ContextMenu':
        return openMenu(at, menuPoint(input));
      case 'F10':
        return event.shiftKey && openMenu(at, menuPoint(input));
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
        return arrow(event, input, at);
      default:
        return false;
    }
  };

  const onFrameKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!selected || event.target !== frameRef.current) return;
    const { axis, index } = selected;
    const used = (() => {
      switch (event.key) {
        case 'Delete': case 'Backspace':
          if (axis === 'row' ? !host.room.rows : !host.room.columns) return false;
          run(axis === 'row' ? { kind: 'delete-row', row: index } : { kind: 'delete-column', col: index });
          setSelected(null);
          return true;
        case 'Escape':
          if (handledByAnotherControl(event.nativeEvent)) return false;
          setSelected(null);
          host.close(true);
          return true;
        case 'ContextMenu': return openMenu(selected, menuPoint(frameRef.current));
        case 'F10': return event.shiftKey && openMenu(selected, menuPoint(frameRef.current));
        case 'Enter':
          setSelected(null);
          open(axis === 'row' ? { row: index, col: 0 } : { row: shown.header && host.room.names ? HEADER_ROW : 0, col: index });
          return true;
        default: return false;
      }
    })();
    if (!used) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return { onCellKey, onFrameKey };
}
