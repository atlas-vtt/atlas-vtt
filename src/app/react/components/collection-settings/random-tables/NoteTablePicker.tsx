import React, { useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../../../packages/components/primitives/button';
import { tablesOfNote } from '../../../../randomTables/noteTables';
import { guessTableKind } from '../../../../randomTables/tableKind';
import type { NoteTables } from '../../../../randomTables/tableModel';
import { tableSourceId } from '../../../../randomTables/tableLookup';
import type { RandomTableSource } from '../../../../types/randomTableTypes';
import LinkedNotePicker from '../../LinkedNotePicker';
import { problemLines, rollFact } from '../../randomTables/tableFacts';
import { t } from '../../../../i18n';

interface NoteTablePickerProps {
  app: App;
  /** Tables the collection rolls on already, by `tableSourceId`. */
  listed: ReadonlySet<string>;
  onAdd: (sources: RandomTableSource[]) => void;
  onCancel: () => void;
}

type Read = { kind: 'reading' } | { kind: 'read'; tables: NoteTables } | { kind: 'failed' };

function useNote(app: App, path: string | null): Read {
  const [read, setRead] = useState<Read>({ kind: 'reading' });
  useEffect(() => {
    const file = path ? app.vault.getFileByPath(path) : null;
    if (!file) return undefined;
    let current = true;
    setRead({ kind: 'reading' });
    app.vault.cachedRead(file).then(
      (text) => { if (current) setRead({ kind: 'read', tables: tablesOfNote(text, file.basename) }); },
      () => { if (current) setRead({ kind: 'failed' }); },
    );
    return () => { current = false; };
  }, [app, path]);
  return read;
}

/** Picks a Markdown note, then which of its tables the collection rolls on. */
export function NoteTablePicker({ app, listed, onAdd, onCancel }: NoteTablePickerProps): React.ReactElement {
  const [path, setPath] = useState<string | null>(null);
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  const notes = useMemo(() => app.vault.getMarkdownFiles(), [app]);
  const read = useNote(app, path);

  if (path === null) {
    return (
      <div className="atlas-csm-loot-picker">
        <LinkedNotePicker app={app} files={notes} icon={FileText} onSelect={setPath} />
        <Button variant="ghost" className="atlas-csm-add-btn" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    );
  }

  const tables = read.kind === 'read' ? read.tables.tables : [];
  const fresh = tables.filter((table) => !listed.has(tableSourceId({ path, index: table.index })));
  const chosen = fresh.filter((table) => !unticked.has(table.index));
  const toggle = (index: number): void => {
    const next = new Set(unticked);
    if (!next.delete(index)) next.add(index);
    setUnticked(next);
  };
  const add = (): void => onAdd(chosen.map((table) => ({
    path,
    ...(table.heading !== undefined && { table: table.name }),
    index: table.index,
    kind: guessTableKind(table.columns),
  })));

  return (
    <div className="atlas-rt-picker">
      <span className="atlas-rt-picker__note">{path.replace(/\.md$/i, '')}</span>
      {read.kind === 'read' && read.tables.tooLarge && <p className="atlas-csm-hint atlas-csm-hint--error">{t('tables.tooLarge')}</p>}
      {read.kind === 'failed' && <p className="atlas-csm-hint atlas-csm-hint--error">{t('tables.settings.readFailed')}</p>}
      {read.kind === 'read' && tables.length === 0 && !read.tables.tooLarge && <p className="atlas-csm-hint">{t('tables.settings.noTables')}</p>}
      <ul className="atlas-rt-picker__tables">
        {tables.map((table) => {
          const already = listed.has(tableSourceId({ path, index: table.index }));
          const problems = problemLines(table.problems);
          return (
            <li key={table.index}>
              <label className={`atlas-rt-picker__table${already ? ' is-listed' : ''}`}>
                <input type="checkbox" checked={already || !unticked.has(table.index)} disabled={already} onChange={() => toggle(table.index)} />
                <span className="atlas-rt-picker__name">{table.name}</span>
                {problems.length > 0 && <span className="atlas-tables-chip atlas-tables-chip--problem">{problems.join(' · ')}</span>}
                <span className="atlas-tables-row__fact">{rollFact(table)}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="atlas-rt-picker__actions">
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="default" disabled={chosen.length === 0} onClick={add}>
          {t('tables.settings.addTables', { count: chosen.length })}
        </Button>
      </div>
    </div>
  );
}
