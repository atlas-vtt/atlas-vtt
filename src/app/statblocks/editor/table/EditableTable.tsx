import React, { useEffect, useRef, useState } from 'react';
import { pasteCells, renameColumn, setCell } from '../../model/tableEdits';
import { HEADER_ROW, type CellAt, type TableGrid } from '../../model/tableGrid';
import type { ScoresBlock } from '../../model/templateTypes';
import { TableLines, type TableLook } from '../../render/blocks/ScoresView';
import { TABLE_COL_ATTRIBUTE, TABLE_ROW_ATTRIBUTE, TableView, unnamedColumn, type BandEdges, type TableDecor } from '../../render/blocks/TableView';
import type { ShownTable } from '../../render/values/shownTable';
import { useSurfaceMenu } from '../interaction/SurfaceMenuProvider';
import { focusStaysIn } from '../statblock-pane/focusWithin';
import { cellText, cellValue, pastedCells } from './cellText';
import { TableAddButtons, TableDropLine, TableHandle, TABLE_HANDLE_ATTRIBUTE } from './TableChrome';
import { TableCellInput, type CaretStart, type CellDraft } from './TableCellInput';
import { runTableCommand, type TableCommand } from './tableCommands';
import type { TableAxis } from './TableDrag';
import { sameCell, type TableHost } from './tableHost';
import { cellMenu, columnHandleMenu, rowEntries } from './tableMenu';
import { useTableDrag } from './useTableDrag';
import { useTableKeys } from './useTableKeys';
import { t } from '../../../i18n';
import './table-editing.scss';

/** Marks the frame of a table typed in place: the surfaces leave its clicks, keys and menus to it. */
export const LIVE_TABLE_ATTRIBUTE = 'data-table-live';

/** A row or column picked by its handle. */
export interface TableSelection {
  axis: TableAxis;
  index: number;
}

export interface EditableTableProps {
  block: ScoresBlock;
  shown: ShownTable;
  look: TableLook;
  /** The surface's side of the table; null draws it as the card does (a template or note that takes no edits). */
  host: TableHost | null;
}

function cellAtElement(cell: Element | null): CellAt | null {
  if (!cell) return null;
  const row = Number(cell.getAttribute(TABLE_ROW_ATTRIBUTE));
  const col = Number(cell.getAttribute(TABLE_COL_ATTRIBUTE));
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
}

function cellFrom(target: EventTarget | null, frame: HTMLElement): CellAt | null {
  const node = target as Partial<Element> | null;
  const cell = typeof node?.closest === 'function' ? node.closest(`[${TABLE_ROW_ATTRIBUTE}]`) : null;
  return cell && frame.contains(cell) ? cellAtElement(cell) : null;
}

/** The typed cell nearest a point, as Obsidian finds the cell a click beside the cells means (a worked-out row, a line's name). */
function closestCell(frame: HTMLElement, x: number, y: number, typed: (at: CellAt) => boolean): Element | null {
  let best: Element | null = null;
  let distance = Infinity;
  for (const cell of frame.querySelectorAll(`[${TABLE_ROW_ATTRIBUTE}]`)) {
    const at = cellAtElement(cell);
    if (!at || !typed(at)) continue;
    const box = cell.getBoundingClientRect();
    const dx = Math.max(box.left - x, 0, x - box.right);
    const dy = Math.max(box.top - y, 0, y - box.bottom);
    const away = Math.hypot(dx, dy);
    if (away < distance) {
      distance = away;
      best = cell;
    }
  }
  return best;
}

/** Where in a cell's text a click landed, where the cell holds plain text; its end otherwise. */
function caretAt(event: React.MouseEvent, cell: Element): CaretStart {
  const position = cell.doc.caretPositionFromPoint?.(event.clientX, event.clientY);
  const text = position?.offsetNode;
  return position && text && text.nodeType === Node.TEXT_NODE && text.parentElement === cell ? position.offset : 'end';
}

/** The cell's text as typing starts: its column's name in the header row, else its value. */
function startText(grid: TableGrid, at: CellAt): string {
  return at.row === HEADER_ROW ? grid.columns[at.col]?.name ?? '' : cellText(grid.rows[at.row]?.[at.col]);
}

/** The grid with `text` typed at `at`: the column's name in the header row, else the cell. */
export function withText(grid: TableGrid, at: CellAt, text: string): TableGrid {
  return at.row === HEADER_ROW ? renameColumn(grid, at.col, text.trim()) : setCell(grid, at.row, at.col, cellValue(text));
}

/** What a cell's field is called for screen readers: its column's name and, where there are several, its row. */
function cellLabel(grid: TableGrid, name: string, at: CellAt): string {
  if (at.row === HEADER_ROW) return t('statblockEditor.table.columnName', { n: at.col + 1 });
  const column = grid.columns[at.col]?.name.trim() || (grid.columns.length === 1 ? name : `${name} ${unnamedColumn(at.col).toLowerCase()}`);
  return grid.rows.length > 1 ? `${column}, row ${at.row + 1}` : column;
}

/**
 * A selected row's or column's cell: washed, with the ring along the selection's outer edges, as Obsidian's.
 * A row that wraps into bands is ringed in each band, from its first cell there to its last (`edges`).
 */
function selectionClasses(selected: TableSelection | null, at: CellAt, grid: TableGrid, header: boolean, edges?: BandEdges): string[] {
  if (!selected) return [];
  const top = header ? HEADER_ROW : 0;
  const lastRow = grid.rows.length - 1;
  const lastCol = grid.columns.length - 1;
  if (selected.axis === 'row') {
    if (at.row !== selected.index) return [];
    const start = edges ? edges.first : at.col === 0;
    const end = edges ? edges.last : at.col === lastCol;
    return ['is-selected', 'is-top', 'is-bottom', ...(start ? ['is-start'] : []), ...(end ? ['is-end'] : [])];
  }
  if (at.col !== selected.index) return [];
  return ['is-selected', 'is-start', 'is-end', ...(at.row === top ? ['is-top'] : []), ...(at.row === lastRow ? ['is-bottom'] : [])];
}

function LiveTable({ block, shown, look, host }: EditableTableProps & { host: TableHost }): React.JSX.Element {
  const frameRef = useRef<HTMLDivElement>(null);
  const menu = useSurfaceMenu();
  const [selected, setSelected] = useState<TableSelection | null>(null);
  const draft = useRef<CellDraft | null>(null);
  const caret = useRef<CaretStart>('all');
  const { room, active } = host;
  const { grid } = shown;

  // A cell typed again later starts from what it holds then.
  useEffect(() => {
    if (!active) draft.current = null;
  }, [active]);

  const open = (at: CellAt, start: CaretStart = 'all'): void => {
    caret.current = start;
    setSelected(null);
    host.open(at);
  };

  /** Runs a command on the table as it holds now, with the text being typed in it: one write; typing goes on at `then`. */
  const run = (command: TableCommand, then?: CellAt): void => {
    const stored = host.grid();
    const typed = draft.current;
    const base = typed && typed.text !== typed.written ? withText(stored, typed.at, typed.text) : stored;
    if (typed) typed.written = typed.text;
    const outcome = runTableCommand(base, command);
    if (outcome.grid !== stored) host.commit(outcome.grid, outcome.grid !== base ? outcome.said : undefined);
    if (outcome.refused) host.announce(outcome.refused);
    if (command.kind === 'move-row' || command.kind === 'move-column') setSelected({ axis: command.kind === 'move-row' ? 'row' : 'column', index: command.to });
    // The rows and columns moved under the cell being typed: typing goes on where the command says, else it ends.
    if (then && outcome.grid !== base) open(then);
    else if (active) host.close(false);
  };

  const drag = useTableDrag(frameRef, room, shown.header, (command) => run(command));
  const menuInput = { grid, room, run: (command: TableCommand) => run(command) };
  const openMenu = (at: CellAt | TableSelection, point: { x: number; y: number }): boolean => {
    const rows = 'axis' in at ? (at.axis === 'row' ? rowEntries(menuInput, at.index) : columnHandleMenu(menuInput, at.index)) : cellMenu(menuInput, at);
    if (!menu || rows.length === 0) return false;
    menu.openAt(rows, point, { returnFocus: frameRef.current });
    return true;
  };
  const keys = useTableKeys({ host, shown, look, selected, setSelected, open, run, openMenu, frameRef });

  const press = (axis: TableAxis, index: number, event: React.PointerEvent<HTMLButtonElement>): void => {
    // The primary button only: a right press opens the handle's menu.
    if (event.button > 0) return;
    if (active) host.close(false);
    setSelected({ axis, index });
    frameRef.current?.focus({ preventScroll: true });
    drag.start(axis, index, event.currentTarget, event.nativeEvent);
  };
  const isSelected = (axis: TableAxis, index: number): boolean => selected?.axis === axis && selected.index === index;

  const decor: TableDecor = {
    cell: (at, rest) => {
      if (!sameCell(at, active)) return rest;
      if (!draft.current || !sameCell(draft.current.at, at)) {
        const text = startText(host.grid(), at);
        draft.current = { at, text, written: text };
      }
      return (
        <TableCellInput
          key={`${at.row}:${at.col}`}
          rest={rest}
          draft={draft.current}
          caret={caret.current}
          label={cellLabel(grid, host.name, at)}
          placeholder={at.row === HEADER_ROW ? unnamedColumn(at.col) : undefined}
          onCommit={(where, text) => {
            const now = host.grid();
            const next = withText(now, where, text);
            if (next !== now) host.commit(next);
          }}
          onKey={(event, input) => keys.onCellKey(event, input, at)}
          onLeave={(to) => { if (!focusStaysIn(frameRef.current, to)) host.leave(at); }}
          registerPending={host.pending}
          onPaste={(text) => {
            const cells = pastedCells(text);
            if (!cells) return null;
            const into = at.row === HEADER_ROW ? { row: 0, col: at.col } : at;
            const filled = pasteCells(host.grid(), into.row, into.col, cells, { rows: room.rows, columns: room.columns });
            host.commit(filled, `Pasted ${cells.flat().length} cells.`);
            return startText(filled, at);
          }}
        />
      );
    },
    cellClass: (at, edges) => [sameCell(at, active) && 'is-typing', ...selectionClasses(selected, at, grid, shown.header, edges)].filter(Boolean).join(' ') || undefined,
    holdBands: active !== null,
    rowHandle: look === 'grid' && room.rows ? (row) => <TableHandle axis="row" index={row} selected={isSelected('row', row)} onPress={press} /> : undefined,
    columnHandle: look === 'grid' && (room.columns || room.align || room.rows)
      ? (col) => <TableHandle axis="column" index={col} selected={isSelected('column', col)} onPress={press} />
      : undefined,
    after: look === 'grid' ? (
      <>
        <TableAddButtons
          rows={room.rows}
          columns={room.columns}
          onAddRow={() => run({ kind: 'insert-row', at: grid.rows.length }, { row: grid.rows.length, col: 0 })}
          onAddColumn={() => run({ kind: 'insert-column', at: grid.columns.length, align: null },
            { row: shown.header && room.names ? HEADER_ROW : 0, col: grid.columns.length })}
        />
        {drag.drop && <TableDropLine line={drag.drop} />}
      </>
    ) : undefined,
    frame: {
      ref: frameRef,
      tabIndex: -1,
      className: [active && 'is-editing', drag.dragging && 'is-dragging', selected && 'has-selection'].filter(Boolean).join(' ') || undefined,
      [LIVE_TABLE_ATTRIBUTE]: '',
      onClick: (event) => {
        const frame = frameRef.current;
        const node = event.target as Partial<Element>;
        // A link in a cell opens its note, as in a note's table; the cell is typed by a click beside it.
        if (!frame || (typeof node.closest === 'function' && node.closest('button, textarea, a'))) return;
        event.stopPropagation();
        const hit = cellFrom(event.target, frame);
        const typed = (at: CellAt): boolean => at.row !== HEADER_ROW || (shown.header && room.names && look === 'grid');
        const cell = hit && typed(hit)
          ? frame.querySelector(`[${TABLE_ROW_ATTRIBUTE}="${hit.row}"][${TABLE_COL_ATTRIBUTE}="${hit.col}"]`)
          : closestCell(frame, event.clientX, event.clientY, typed);
        const at = cellAtElement(cell);
        if (!at || !cell || sameCell(at, active)) return;
        open(at, hit && sameCell(hit, at) ? caretAt(event, cell) : 'end');
      },
      onContextMenu: (event) => {
        const frame = frameRef.current;
        if (!frame) return;
        const node = event.target as Partial<Element>;
        const handle = typeof node.closest === 'function' ? node.closest(`[${TABLE_HANDLE_ATTRIBUTE}]`) : null;
        const axis = handle?.getAttribute(TABLE_HANDLE_ATTRIBUTE);
        const picked: TableSelection | null = handle && (axis === 'row' || axis === 'column') ? { axis, index: Number(handle.getAttribute('data-index')) } : null;
        const at = picked ?? cellFrom(event.target, frame);
        if (!at) return;
        // A cell's menu acts on the cell: a row or column picked before is let go, as Obsidian lets it go.
        setSelected(picked);
        if (!openMenu(at, { x: event.clientX, y: event.clientY })) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onKeyDown: keys.onFrameKey,
      onBlur: (event) => {
        if (!focusStaysIn(frameRef.current, event.relatedTarget)) setSelected(null);
      },
    },
  };

  return look === 'lines' ? <TableLines shown={shown} decor={decor} perLine={block.perLine} /> : <TableView shown={shown} decor={decor} />;
}

/**
 * A Table typed in place on the statblock pane and in the template editor,
 * as Obsidian 1.14 edits a Live Preview table: a click types a cell, Tab and
 * Enter walk the cells (adding a row past the last where rows may be added),
 * the arrows cross a cell's edge, a paste of a spreadsheet's block fills the
 * cells; the handles at a row's left and a column's top select and drag it,
 * the add buttons at the bottom and the right add a row and a column, and a
 * right-click opens Obsidian's Row and Column menus. What the surface does not
 * allow (`host.room`) is neither drawn nor offered.
 */
export function EditableTable({ block, shown, look, host }: EditableTableProps): React.JSX.Element {
  if (host) return <LiveTable block={block} shown={shown} look={look} host={host} />;
  return look === 'lines' ? <TableLines shown={shown} perLine={block.perLine} /> : <TableView shown={shown} />;
}
