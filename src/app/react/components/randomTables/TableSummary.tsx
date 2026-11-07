import React, { useId } from 'react';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import { problemLines, statusLine, tableFactLong } from './tableFacts';
import { t } from '../../../i18n';

interface TableSummaryProps {
  found: CollectionTable;
  onNoRepeatsChange: (noRepeats: boolean) => void;
  onOpenNote: () => void;
}

/** The selected table at a glance: how it rolls, what is wrong with it, No repeats (not for a generator) and Open note. */
export function TableSummary({ found, onNoRepeatsChange, onOpenNote }: TableSummaryProps): React.ReactElement {
  const switchLabel = useId();
  const status = statusLine(found);
  const problems = found.table ? problemLines(found.table.problems) : [];
  const noRepeats = found.source.noRepeats === true;

  return (
    <div className="atlas-tables-summary">
      {found.table && <span className="atlas-tables-chip">{tableFactLong(found)}</span>}
      {[...(status ? [status] : []), ...problems].map((line) => (
        <span key={line} className="atlas-tables-chip atlas-tables-chip--problem">
          <AlertTriangle />
          {line}
        </span>
      ))}
      <span className="atlas-tables-summary__end">
        {/* A generator rolls every part each time: it has no rows to repeat. */}
        {found.source.kind !== 'generator' && (
          <>
            <span id={switchLabel} className="atlas-tables-summary__switch-label">{t('tables.noRepeats')}</span>
            <ToggleSwitch size="s" value={noRepeats} labelledBy={switchLabel} onChange={() => onNoRepeatsChange(!noRepeats)} />
          </>
        )}
        <LabelTooltip label={t('tables.openNote')}>
          <Button variant="ghost" size="icon" className="atlas-tables-summary__open" onClick={onOpenNote}>
            <ArrowUpRight />
          </Button>
        </LabelTooltip>
      </span>
    </div>
  );
}
