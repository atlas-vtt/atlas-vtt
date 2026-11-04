import React, { useContext } from 'react';
import type { ScoresBlock } from '../../model/templateTypes';
import { valueMisfit } from '../../values/valueFit';
import { valueText } from '../../values/valueText';
import { useSheet } from '../sheetContext';
import { columnGroups, shownTable, type ShownTable } from '../values/shownTable';
import { NO_TEXT } from '../values/shownText';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueEditingContext, ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';
import { CellText, ColumnName, rollNameOf, TABLE_COL_ATTRIBUTE, TABLE_ROW_ATTRIBUTE, TableView, type TableDecor } from './TableView';

type GridStyle = React.CSSProperties & Record<`--${string}`, number>;

/** How a Table is drawn: a grid, or a table of one row as one line per column (the 5E 2024 look). */
export type TableLook = 'grid' | 'lines';

/** The look a Table takes: its lines only while it holds one row. */
export function tableLook(block: ScoresBlock, shown: ShownTable): TableLook {
  return block.orientation === 'table' && shown.grid.rows.length === 1 ? 'lines' : 'grid';
}

interface LinesProps {
  shown: ShownTable;
  decor?: TableDecor | undefined;
  /** The columns this group holds, by their place in the table. */
  cols: readonly number[];
}

/** One group of a table of one row: per column its name, its value and its worked-out values ("Str 21 +5 +5"). */
function LineGroup({ shown, decor, cols }: LinesProps): React.JSX.Element {
  const labelled = shown.derived.some((row) => row.label.trim());
  return (
    <table className="atlas-sb-score-group">
      {labelled && (
        <thead>
          <tr>
            <td className="atlas-sb-score-corner" colSpan={2} />
            {shown.derived.map((row, index) => <th key={index} scope="col" className="atlas-sb-score-column-label">{row.label}</th>)}
          </tr>
        </thead>
      )}
      <tbody>
        {cols.map((col) => {
          const at = { row: 0, col };
          const cell = <CellText shown={shown.cells[0]?.[col] ?? NO_TEXT} rollable={shown.rollable} />;
          const extra = decor?.cellClass?.(at);
          const attributes = { [TABLE_ROW_ATTRIBUTE]: 0, [TABLE_COL_ATTRIBUTE]: col, ...rollNameOf(shown, col) };
          return (
            <tr key={col}>
              <th scope="row" className="atlas-sb-score-label"><ColumnName name={shown.grid.columns[col]?.name ?? ''} col={col} /></th>
              <td className={extra ? `atlas-sb-score ${extra}` : 'atlas-sb-score'} {...attributes}>{decor?.cell ? decor.cell(at, cell) : cell}</td>
              {shown.derived.map((row, index) => (
                <td key={index} className="atlas-sb-score-column" {...rollNameOf(shown, col)}><CellText shown={row.cells[col] ?? NO_TEXT} rollable={shown.rollable} /></td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A table of one row as up to `perLine` groups of lines side by side, one line per column. */
export function TableLines({ shown, decor, perLine }: { shown: ShownTable; decor?: TableDecor | undefined; perLine: number | undefined }): React.JSX.Element {
  const style: GridStyle = { '--atlas-sb-score-columns': shown.derived.length };
  const { ref, className, ...frame } = decor?.frame ?? {};
  const groups = columnGroups(shown.grid.columns.map((_, col) => col), perLine);
  return (
    <div ref={ref} className={className ? `atlas-sb-scores atlas-sb-scores--table ${className}` : 'atlas-sb-scores atlas-sb-scores--table'} style={style} {...frame}>
      {groups.map((cols, index) => <LineGroup key={index} shown={shown} decor={decor} cols={cols} />)}
    </div>
  );
}

function ScoresContent({ block, display }: BlockViewProps<ScoresBlock>): React.JSX.Element {
  const { state } = useSheet();
  const editing = useContext(ValueEditingContext);
  const shown = shownTable(block, display, state);
  if (shown) {
    const look = tableLook(block, shown);
    if (editing?.table) return <>{editing.table(block, shown, look)}</>;
    return look === 'lines' ? <TableLines shown={shown} perLine={block.perLine} /> : <TableView shown={shown} />;
  }
  if (display.state !== 'value') return <StandIn display={display} />;
  // A value that holds no table (its field's type changed) shows as it is written.
  const field = state.fields.get(block.field);
  const value = state.reader(block.field);
  if (field && valueMisfit(field, value)) return <ValueText shown={{ text: valueText(value), problems: [] }} />;
  return <></>;
}

/** A Table: rows of cells under named columns, as Obsidian draws a Markdown table, or one row as lines (`TableLines`). */
export function ScoresView(props: BlockViewProps<ScoresBlock>): React.JSX.Element {
  return <ValueSlot block={props.block}><ScoresContent {...props} /></ValueSlot>;
}
