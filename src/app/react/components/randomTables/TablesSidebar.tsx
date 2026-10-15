import React, { useEffect, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { lootBaseItemCount, needsBases, type LootBase } from '../../../loot/LootBaseReader';
import type { CollectionTable } from '../../../randomTables/TableNoteReader';
import { LootViewChecks } from '../loot/LootSourceTree';
import type { ContextMenuEntry } from '../../root/ContextMenuContext';
import { SourceRow } from './SourceRow';
import { matchesSearch } from './tableSelection';
import { ownTableName, problemLines, rollFact, statusLine, tableName } from './tableFacts';
import type { RandomTablesLibrary } from './useRandomTables';
import { t } from '../../../i18n';

function baseProblems(base: LootBase): string[] {
  if (base.missing) return [t('csm.loot.notFound')];
  if (needsBases(base)) return [t('csm.loot.basesOff')];
  if (base.views.length === 0) return [t('csm.loot.noViews')];
  return [];
}

function tableProblems(found: CollectionTable): string[] {
  const status = statusLine(found);
  return [...(status ? [status] : []), ...(found.table ? problemLines(found.table.problems) : [])];
}

interface TablesSidebarProps {
  library: Pick<RandomTablesLibrary, 'items' | 'text'>;
  /** Id of the source rolled on. */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Base views switched off. */
  disabledViews: ReadonlySet<string>;
  onDisabledViewsChange: (disabled: string[]) => void;
  /** Opens New table, which writes a table pasted from elsewhere as a note. */
  onNewTable: () => void;
  /** Gives a table the name the window shows; an empty name shows its own again. */
  onRename: (table: CollectionTable, name: string) => void;
  /** Takes a table or a base off the list; the note or base stays. */
  onRemove: (source: CollectionTable | LootBase) => void;
  /** Opens a table's note or a base. */
  onOpen: (path: string, name: string) => void;
}

/**
 * The collection's tables to pick one to roll on, grouped by what they give: Items (the loot
 * bases, the selected one with its views to tick, then the Items tables of notes) and Text.
 */
export function TablesSidebar(props: TablesSidebarProps): React.ReactElement {
  const { library, selectedId, onSelect, disabledViews, onDisabledViewsChange, onNewTable, onRename, onRemove, onOpen } = props;
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** The row being removed: once it is gone, focus that went with it waits in the search. */
  const removing = useRef<string | null>(null);

  const removeEntry = (id: string, source: CollectionTable | LootBase): ContextMenuEntry => ({
    type: 'item', label: t('tables.removeFromList'), icon: 'trash-2', destructive: true,
    onClick: () => {
      removing.current = id;
      onRemove(source);
    },
  });
  const tableMenu = (table: CollectionTable): ContextMenuEntry[] => [
    { type: 'item', label: t('tables.rename'), icon: 'pencil', onClick: () => setRenamingId(table.id) },
    { type: 'item', label: t('tables.openNote'), icon: 'file-text', disabled: table.status === 'note-missing', onClick: () => onOpen(table.source.path, table.noteName) },
    removeEntry(table.id, table),
  ];
  const baseMenu = (base: LootBase): ContextMenuEntry[] => [
    { type: 'item', label: t('tables.openBase'), icon: 'table', disabled: base.missing, onClick: () => onOpen(base.path, base.name) },
    removeEntry(base.path, base),
  ];
  const bases = library.items.bases.filter((base) => matchesSearch(base.name, search)
    || base.views.some((view) => matchesSearch(view.name, search)));
  useEffect(() => {
    if (removing.current === null) return;
    const listed = [...library.items.bases.map((base) => base.path), ...library.items.tables.map((table) => table.id), ...library.text.map((table) => table.id)];
    if (listed.includes(removing.current)) return;
    removing.current = null;
    const field = searchRef.current;
    const active = field?.ownerDocument.activeElement;
    if (field && (!active || active === field.ownerDocument.body || !active.isConnected)) field.focus();
  });

  // A renamed table is found by either name.
  const tableMatches = (table: CollectionTable): boolean => matchesSearch(tableName(table), search) || matchesSearch(ownTableName(table), search);
  const itemTables = library.items.tables.filter(tableMatches);
  const textTables = library.text.filter(tableMatches);

  const tableRow = (table: CollectionTable): React.ReactElement => (
    <li key={table.id}>
      <SourceRow
        name={tableName(table)}
        fact={table.table ? rollFact(table.table) : ''}
        problems={tableProblems(table)}
        selected={table.id === selectedId}
        onSelect={() => onSelect(table.id)}
        menu={() => tableMenu(table)}
        renaming={table.id === renamingId}
        onRenamed={(name) => {
          setRenamingId(null);
          if (name !== null) onRename(table, name);
        }}
      />
    </li>
  );

  return (
    <div className="atlas-tables-sidebar">
      <div className="atlas-tables-sidebar__head">
        <label className="atlas-tables-search">
          <Search />
          <input
            ref={searchRef}
            type="search"
            value={search}
            placeholder={t('tables.search')}
            aria-label={t('tables.search')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <LabelTooltip label={t('tables.newTable')}>
          <Button variant="ghost" size="icon" className="atlas-tables-sidebar__new" onClick={onNewTable}>
            <Plus />
          </Button>
        </LabelTooltip>
      </div>

      {(bases.length > 0 || itemTables.length > 0) && (
        <section className="atlas-tables-group" aria-label={t('tables.group.items')}>
          <h3 className="atlas-loot-section-label">{t('tables.group.items')}</h3>
          <ul>
            {bases.map((base) => (
              <li key={base.path}>
                <SourceRow
                  name={base.name}
                  fact={String(lootBaseItemCount(base))}
                  problems={baseProblems(base)}
                  selected={base.path === selectedId}
                  onSelect={() => onSelect(base.path)}
                  menu={() => baseMenu(base)}
                />
                {base.path === selectedId && (
                  <LootViewChecks base={base} disabled={disabledViews} onChange={onDisabledViewsChange} />
                )}
              </li>
            ))}
            {itemTables.map(tableRow)}
          </ul>
        </section>
      )}

      {textTables.length > 0 && (
        <section className="atlas-tables-group" aria-label={t('tables.group.text')}>
          <h3 className="atlas-loot-section-label">{t('tables.group.text')}</h3>
          <ul>{textTables.map(tableRow)}</ul>
        </section>
      )}

      {bases.length + itemTables.length + textTables.length === 0 && (
        <p className="atlas-tables-sidebar__none">{t('tables.noMatch')}</p>
      )}
    </div>
  );
}
