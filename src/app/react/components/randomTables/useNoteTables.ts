import { useEffect, useState } from 'react';
import type { App } from 'obsidian';
import { TableNoteReader, type CollectionTable } from '../../../randomTables/TableNoteReader';
import type { RandomTableSource } from '../../../types/randomTableTypes';

export interface NoteTables {
  /** One entry per source, in their order, as its note holds it now. */
  tables: readonly CollectionTable[];
  /** The reader, for the links in results; null before it started. */
  reader: TableNoteReader | null;
  /** Every source's note has been read once. */
  loaded: boolean;
}

/** The tables `sources` name in their notes, read and followed while mounted. */
export function useNoteTables(app: App, sources: readonly RandomTableSource[]): NoteTables {
  const [tables, setTables] = useState<readonly CollectionTable[]>([]);
  const [reader, setReader] = useState<TableNoteReader | null>(null);

  useEffect(() => {
    const next = new TableNoteReader(app, setTables);
    setReader(next);
    return () => next.stop();
  }, [app]);

  useEffect(() => {
    reader?.setSources(sources);
  }, [reader, sources]);

  const loaded = reader !== null && tables.length === sources.length && tables.every((table) => table.status !== 'loading');
  return { tables, reader, loaded };
}
