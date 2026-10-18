import React, { useContext } from 'react';
import type { CellAt } from '../../model/tableGrid';
import { HEADER_ROW } from '../../model/tableGrid';
import type { TableAlign } from '../../model/templateTypes';
import { SheetContext, useSheet } from '../sheetContext';
import { BonusLink } from '../shared/BonusLink';
import { InlineText } from '../shared/InlineText';
import { ProblemMarker } from '../values/ProblemMarker';
import { hasText, NO_TEXT, type ShownText } from '../values/shownText';
import type { ShownTable } from '../values/shownTable';
import { TABLE_COL_ATTRIBUTE, TABLE_ROW_ATTRIBUTE } from './tableAttributes';
import { useTableBands } from './useTableBands';

export { TABLE_COL_ATTRIBUTE, TABLE_ROW_ATTRIBUTE };

/** What a column without a name is called while a statblock or template is edited. */
export function unnamedColumn(col: number): string {
  return `Column ${col + 1}`;
}

/** What an editor adds to the table: its inputs, handles and buttons. Every part is optional; the card has none. */
export interface TableDecor {
  /** What stands in a cell: `content` itself, or the editor's input over it. */
  cell?: ((at: CellAt, content: React.ReactNode) => React.ReactNode) | undefined;
  /** A cell's own class names (selection, the cell being typed); `edges` says whether it starts or ends its band's row. */
  cellClass?: ((at: CellAt, edges?: BandEdges) => string | undefined) | undefined;
  /** Drawn in each row's first cell, out of the flow: the row's handle. */
  rowHandle?: ((row: number) => React.ReactNode) | undefined;
  /** Drawn in each first-row cell, out of the flow: the column's handle. */
  columnHandle?: ((col: number) => React.ReactNode) | undefined;
  /** Drawn after the table in its frame: the add buttons, a drag's drop line. */
  after?: React.ReactNode;
  /** A cell is typed: the bands stay as they are, so it keeps its place (`useTableBands`). */
  holdBands?: boolean | undefined;
  /** The frame around the table: its ref, keys and pointer handlers. */
  frame?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> } & Record<`data-${string}`, string | undefined>;
}

/** Where a cell stands in its band's row: a row that wraps into bands starts and ends in each of them. */
export interface BandEdges {
  first: boolean;
  last: boolean;
}

const ALIGNS: Readonly<Record<TableAlign, React.CSSProperties['textAlign']>> = { start: 'start', center: 'center', end: 'end' };

function alignStyle(align: TableAlign | null): React.CSSProperties | undefined {
  return align && align !== 'start' ? { textAlign: ALIGNS[align] } : undefined;
}

/**
 * A cell's text, Markdown drawn as a note's table draws it, or a zero-width space that keeps an empty cell one line
 * high, as Obsidian keeps one with a line break. In a rollable table a whole number rolls as a bonus.
 */
export function CellText({ shown, rollable }: { shown: ShownText; rollable?: boolean | undefined }): React.JSX.Element {
  const sheet = useContext(SheetContext);
  const text = <InlineText text={shown.text} app={sheet?.app} sourcePath={sheet?.sourcePath} dice />;
  return (
    <>
      {hasText(shown) ? <BonusLink text={shown.text} rollable={rollable}>{text}</BonusLink> : '\u200b'}
      {shown.problems.length > 0 && <ProblemMarker problems={shown.problems} />}
    </>
  );
}

/** A column's name, or while editing what an unnamed one is called, faint. */
export function ColumnName({ name, col }: { name: string; col: number }): React.ReactNode {
  const { state } = useSheet();
  if (name.trim()) return name;
  return state.mode === 'editing' ? <span className="atlas-sb-sheet-table__unnamed">{unnamedColumn(col)}</span> : '\u200b';
}

function cellProps(at: CellAt, edges: BandEdges, decor: TableDecor | undefined, align: TableAlign | null, base: string): React.TdHTMLAttributes<HTMLTableCellElement> {
  const extra = decor?.cellClass?.(at, edges);
  return {
    className: extra ? `${base} ${extra}` : base,
    style: alignStyle(align),
    [TABLE_ROW_ATTRIBUTE]: at.row,
    [TABLE_COL_ATTRIBUTE]: at.col,
  } as React.TdHTMLAttributes<HTMLTableCellElement>;
}

/** In a rollable table, what names a cell's roll: its column (a cell holds no label of its own). */
export function rollNameOf(shown: ShownTable, col: number): { 'data-roll-name'?: string } {
  const name = shown.rollable ? shown.grid.columns[col]?.name.trim() : undefined;
  return name ? { 'data-roll-name': name } : {};
}

interface BandProps {
  shown: ShownTable;
  decor: TableDecor | undefined;
  /** The columns this band holds, by their place in the table. */
  cols: readonly number[];
}

/** One band of a Table: its columns' names over its share of every row, then of the worked-out rows. */
function TableBand({ shown, decor, cols }: BandProps): React.JSX.Element {
  const { grid, cells, derived } = shown;
  const labelled = derived.some((row) => row.label.trim());
  const corner = labelled ? <td className="atlas-sb-sheet-table__corner" aria-hidden="true" /> : null;
  const first = shown.header ? HEADER_ROW : 0;
  const content = (at: CellAt, node: React.ReactNode): React.ReactNode => (decor?.cell ? decor.cell(at, node) : node);
  const handles = (at: CellAt): React.ReactNode => (
    <>
      {at.col === 0 && at.row >= 0 && decor?.rowHandle?.(at.row)}
      {at.row === first && decor?.columnHandle?.(at.col)}
    </>
  );
  const edges = (index: number): BandEdges => ({ first: index === 0, last: index === cols.length - 1 });

  return (
    <table className="atlas-sb-sheet-table__grid">
      {shown.header && (
        <thead>
          <tr>
            {corner}
            {cols.map((col, index) => {
              const at = { row: HEADER_ROW, col };
              return (
                <th key={col} scope="col" {...cellProps(at, edges(index), decor, grid.columns[col]?.align ?? null, 'atlas-sb-sheet-table__name')}>
                  {content(at, <ColumnName name={grid.columns[col]?.name ?? ''} col={col} />)}
                  {handles(at)}
                </th>
              );
            })}
          </tr>
        </thead>
      )}
      <tbody>
        {cells.map((row, r) => (
          <tr key={r}>
            {corner}
            {cols.map((col, index) => {
              const at = { row: r, col };
              return (
                <td key={col} {...cellProps(at, edges(index), decor, grid.columns[col]?.align ?? null, 'atlas-sb-sheet-table__cell')} {...rollNameOf(shown, col)}>
                  {content(at, <CellText shown={row[col] ?? NO_TEXT} rollable={shown.rollable} />)}
                  {handles(at)}
                </td>
              );
            })}
          </tr>
        ))}
        {derived.map((row, index) => (
          <tr key={`derived-${index}`} className="atlas-sb-sheet-table__derived">
            {labelled && <th scope="row" className="atlas-sb-sheet-table__derived-label">{row.label}</th>}
            {cols.map((col) => (
              <td key={col} className="atlas-sb-sheet-table__worked" style={alignStyle(grid.columns[col]?.align ?? null)} {...rollNameOf(shown, col)}>
                <CellText shown={row.cells[col] ?? NO_TEXT} rollable={shown.rollable} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A Table as Obsidian draws a Markdown table (its `--table-*` theme
 * variables): the header row of column names over the rows, then the
 * worked-out rows, muted, after a corner column for their labels. One too
 * wide for its card wraps into bands, as Fantasy Statblocks wraps its tables
 * (`useTableBands`), and never scrolls. The frame around it has room for an
 * editor's handles and add buttons on every side, held out of the card's
 * flow, so the editing card is laid out as the card is.
 */
export function TableView({ shown, decor }: { shown: ShownTable; decor?: TableDecor | undefined }): React.JSX.Element {
  const { bands, squeezed, roomRef } = useTableBands(shown.grid.columns.length, decor?.holdBands ?? false);
  const { ref, className, ...frame } = decor?.frame ?? {};

  return (
    <div ref={roomRef} className="atlas-sb-sheet-table" data-squeezed={squeezed || undefined}>
      <div className="atlas-sb-sheet-table__room">
        <div ref={ref} className={className ? `atlas-sb-sheet-table__frame ${className}` : 'atlas-sb-sheet-table__frame'} {...frame}>
          {bands.map((cols, index) => <TableBand key={index} shown={shown} decor={decor} cols={cols} />)}
          {decor?.after}
        </div>
      </div>
    </div>
  );
}
