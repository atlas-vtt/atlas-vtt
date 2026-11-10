import { useEffect, useRef, useState } from 'react';
import { importTableFile, type TableImportFile } from '../../../randomTables/import/importFile';
import { TableImportError, type ImportCandidate, type TableDiscovery } from '../../../randomTables/import/importModel';
import type { ImportedTableNote, ImportSaveJournal } from '../../../randomTables/import/saveImportedTables';
import { guessTableKind } from '../../../randomTables/tableKind';
import { tablesOfNote } from '../../../randomTables/noteTables';
import { tableNoteText } from '../../../randomTables/tableMarkdown';
import type { PastedTable } from '../../../randomTables/pastedTable';
import { t } from '../../../i18n';

export interface ReviewedImportTable extends ImportCandidate {
  id: number;
  kind: ImportedTableNote['kind'];
  selected: boolean;
  usesHeader: boolean;
  tableWithHeader: PastedTable;
}

export interface FileImportActions {
  onSave: (notes: readonly ImportedTableNote[], journal: ImportSaveJournal) => Promise<void>;
  onClose: () => void;
  onStateChange: (saving: boolean, hasWrites: boolean) => void;
}

function message(error: unknown): string {
  return error instanceof TableImportError ? t(`tables.import.error.${error.code}`) : t('tables.import.error.malformed');
}

/** Owns one import session: switching inputs aborts old reads, and retry retains every created note. */
export function useTableFileImport(actions: FileImportActions): {
  tables: ReviewedImportTable[];
  warnings: TableDiscovery['warnings'];
  filename: string;
  reading: boolean;
  progress: { page: number; pages: number } | null;
  saving: boolean;
  hasWrites: boolean;
  error: string | null;
  read: (file: TableImportFile) => void;
  update: (id: number, changes: Partial<Pick<ReviewedImportTable, 'name' | 'kind' | 'selected' | 'usesHeader'>>) => void;
  save: () => void;
  cancelRead: () => void;
} {
  const [tables, setTables] = useState<ReviewedImportTable[]>([]);
  const [warnings, setWarnings] = useState<TableDiscovery['warnings']>([]);
  const [filename, setFilename] = useState('');
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<{ page: number; pages: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const journal = useRef<ImportSaveJournal>(new Map());
  const savePending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);

  const read = (file: TableImportFile): void => {
    if (savePending.current || journal.current.size > 0) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setFilename(file.name);
    setTables([]);
    setWarnings([]);
    setError(null);
    setProgress(null);
    setReading(true);
    void importTableFile(file, { resultHeader: t('tables.paste.resultColumn'), rollHeader: t('tables.paste.rollColumn') }, {
      signal: current.signal,
      onProgress: (page, pages) => { if (mounted.current && !current.signal.aborted) setProgress({ page, pages }); },
    }).then((result) => {
      if (!mounted.current || current.signal.aborted) return;
      setTables(result.tables.map((candidate, id) => ({
        ...candidate, id, selected: false, usesHeader: true, tableWithHeader: candidate.table,
        kind: guessTableKind(tablesOfNote(tableNoteText(candidate.name || 'Table', candidate.table), 'Table').tables[0]?.columns ?? []),
      })));
      setWarnings(result.warnings);
    }).catch((failure: unknown) => {
      if (mounted.current && !current.signal.aborted) setError(message(failure));
    }).finally(() => {
      if (mounted.current && controller.current === current) setReading(false);
    });
  };

  const update = (id: number, changes: Partial<Pick<ReviewedImportTable, 'name' | 'kind' | 'selected' | 'usesHeader'>>): void => {
    if (savePending.current || journal.current.size > 0) return;
    setTables((previous) => previous.map((table) => {
      if (table.id !== id) return table;
      const next = { ...table, ...changes };
      if (changes.usesHeader !== undefined) next.table = changes.usesHeader ? table.tableWithHeader : table.headerlessTable ?? table.tableWithHeader;
      return next;
    }));
    setError(null);
  };

  const save = (): void => {
    if (savePending.current || reading) return;
    const selected = tables.filter((table) => table.selected);
    if (selected.length === 0 || selected.some((table) => table.name.trim() === '')) return;
    savePending.current = true;
    setSaving(true);
    setError(null);
    actions.onStateChange(true, journal.current.size > 0);
    void actions.onSave(selected, journal.current).then(() => {
      if (mounted.current) actions.onClose();
    }).catch((failure: unknown) => {
      if (mounted.current) setError(failure instanceof TableImportError ? message(failure) : t('tables.import.saveFailed'));
    }).finally(() => {
      savePending.current = false;
      if (mounted.current) {
        setSaving(false);
        actions.onStateChange(false, journal.current.size > 0);
      }
    });
  };

  const cancelRead = (): void => {
    controller.current?.abort();
    setReading(false);
    setProgress(null);
    setFilename('');
  };

  return { tables, warnings, filename, reading, progress, saving, hasWrites: journal.current.size > 0, error, read, update, save, cancelRead };
}
