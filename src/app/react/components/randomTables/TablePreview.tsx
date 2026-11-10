import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { inlineDice } from '../../../randomTables/resultCells';
import type { RandomTable } from '../../../randomTables/tableModel';
import { formatList, t } from '../../../i18n';
import { problemLines, rollFactLong } from './tableFacts';

/** Rows shown before the rest is only counted. */
const SHOWN_ROWS = 40;
/** Backtick dice in a cell, which the preview marks as the result will show them. */
const BACKTICK_DICE = /(`[^`\n]{1,200}`)/;

/** A cell as the preview shows it: its dice in backticks marked, everything else as written. */
function PreviewCell({ text }: { text: string }): React.ReactElement {
  return (
    <>
      {text.split(BACKTICK_DICE).map((part, index) => (index % 2 === 1 && inlineDice(part).length > 0
        ? <span key={index} className="atlas-table-preview__dice">{inlineDice(part)[0]}</span>
        : part))}
    </>
  );
}

interface TablePreviewProps {
  /** The table as the note Atlas writes will hold it. */
  table: RandomTable;
}

/** What a pasted table will be once saved: how it rolls, its problems and its rows. Read only. */
export function TablePreview({ table }: TablePreviewProps): React.ReactElement {
  const problems = problemLines(table.problems);
  const dice = [...new Set(table.rows.flatMap((row) => row.cells.flatMap(inlineDice)))];
  const hidden = table.rows.length - SHOWN_ROWS;

  return (
    <div className="atlas-table-preview">
      <div className="atlas-tables-summary">
        <span className="atlas-tables-chip">{rollFactLong(table)}</span>
        {problems.length === 0 ? (
          <span className="atlas-tables-chip atlas-tables-chip--fine"><Check />{t('tables.covered', { count: table.rows.length })}</span>
        ) : problems.map((line) => (
          <span key={line} className="atlas-tables-chip atlas-tables-chip--problem"><AlertTriangle />{line}</span>
        ))}
      </div>
      <table className="atlas-table-preview__table">
        <thead>
          <tr>
            {table.hasRollColumn && <th>{table.die?.label ?? ''}</th>}
            {table.columns.map((column, index) => <th key={index}>{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {table.rows.slice(0, SHOWN_ROWS).map((row) => (
            <tr key={row.index} className={row.ranges.length === 0 && table.hasRollColumn ? 'is-unread' : undefined}>
              {table.hasRollColumn && <td className="atlas-table-preview__roll">{row.roll}</td>}
              {row.cells.map((cell, index) => <td key={index}><PreviewCell text={cell} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && <p className="atlas-table-preview__more">{t('tables.paste.moreRows', { count: hidden })}</p>}
      {dice.length > 0 && <p className="atlas-table-preview__more">{t('tables.rolledWithResult', { dice: formatList(dice), count: dice.length })}</p>}
    </div>
  );
}
