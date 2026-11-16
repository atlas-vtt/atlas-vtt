/**
 * RandomTablesTab: the tables the collection rolls on (tables of notes, and loot bases whose
 * views are Items tables), how each is used, the currency of item prices and the words its items
 * name their rarity with. It never edits what a table holds: the note or base is the table.
 */

import React, { useMemo, useState } from 'react';
import { FileText, Plus, Table } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { editedItemRarities, parseItemRarities, systemItemRarities } from '../../../gameSystems/itemRarities';
import { readRandomTables, withoutRandomTable, withRandomTable } from '../../../randomTables/tableSettings';
import { tableSourceId } from '../../../randomTables/tableLookup';
import type { RandomTableSource, RarityOption } from '../../../types/randomTableTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { noteName, parentPath } from '../../../utils/pathUtils';
import { useLootBases } from '../loot/useLootBases';
import { useNoteTables } from '../randomTables/useNoteTables';
import LinkedNotePicker from '../LinkedNotePicker';
import { Tutorial } from '../../../onboarding/Tutorial';
import { LOOT_SETTINGS_STEPS, LOOT_TUTORIAL_LABEL } from '../../../onboarding/lootTutorials';
import { BaseSourceRow } from './random-tables/BaseSourceRow';
import { ItemRaritiesSection } from './random-tables/ItemRaritiesSection';
import { NoteTablePicker } from './random-tables/NoteTablePicker';
import { TableSourceRow } from './random-tables/TableSourceRow';
import { t } from '../../../i18n';

interface RandomTablesTabProps {
  app: App;
  lootBases: string[];
  onBasesChange: (lootBases: string[]) => void;
  /** As stored, entries of a newer Atlas included. */
  randomTables: readonly RandomTableSource[];
  onRandomTablesChange: (randomTables: readonly RandomTableSource[]) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  /** The collection's own words; undefined while it takes its system's. */
  itemRarities: readonly RarityOption[] | undefined;
  onItemRaritiesChange: (itemRarities: readonly RarityOption[] | undefined) => void;
  systemPresetId: string | undefined;
  presets: readonly SystemPreset[];
}

type Adding = 'note' | 'base' | null;

export function RandomTablesTab(props: RandomTablesTabProps): React.ReactElement {
  const { app, lootBases, onBasesChange, randomTables, onRandomTablesChange, currency, onCurrencyChange } = props;
  const { bases } = useLootBases(app, lootBases);
  const sources = useMemo(() => readRandomTables({ randomTables: [...randomTables] }), [randomTables]);
  const { tables } = useNoteTables(app, sources);
  const [adding, setAdding] = useState<Adding>(null);
  const baseFiles = useMemo(() => app.vault.getFiles().filter((file) => file.extension === 'base'), [app]);
  const listed = useMemo(() => new Set(sources.map(tableSourceId)), [sources]);
  const notes = [...new Set(sources.map((source) => source.path))];

  const stored = { randomTables: [...randomTables] };
  const change = (source: RandomTableSource): void => onRandomTablesChange(withRandomTable(stored, source));
  const addTables = (added: RandomTableSource[]): void => {
    onRandomTablesChange(added.reduce((list, source) => withRandomTable({ randomTables: list }, source), [...randomTables]));
    setAdding(null);
  };
  const addBase = (path: string): void => {
    if (!lootBases.includes(path)) onBasesChange([...lootBases, path]);
    setAdding(null);
  };

  const system = systemItemRarities({ systemPresetId: props.systemPresetId }, props.presets);
  const own = parseItemRarities(props.itemRarities);
  const rarities = props.itemRarities ?? system;

  return (
    <>
      <Tutorial
        id="lootSettings"
        label={LOOT_TUTORIAL_LABEL}
        steps={LOOT_SETTINGS_STEPS}
        action={lootBases.length === 0 && sources.length === 0 ? { label: t('csm.loot.addBase'), onClick: () => setAdding('base') } : undefined}
      />

      <div className="atlas-csm-field atlas-csm-loot-bases">
        <span className="atlas-csm-label">{t('tables.settings.tables')}</span>
        {lootBases.length + notes.length === 0 && adding === null && <div className="atlas-csm-empty">{t('tables.empty')}</div>}
        {notes.map((path) => (
          <section key={path} className="atlas-rt-note" aria-label={noteName(path)}>
            <h4 className="atlas-rt-note__head">
              <FileText />
              <span className="atlas-rt-note__name">{noteName(path)}</span>
              <span className="atlas-rt-note__folder">{parentPath(path) || t('csm.loot.vaultRoot')}</span>
            </h4>
            {tables.filter((found) => found.source.path === path).map((found) => (
              <TableSourceRow
                key={found.id}
                app={app}
                found={found}
                onChange={change}
                onRemove={() => onRandomTablesChange(withoutRandomTable(stored, found.source.path, found.source.index))}
              />
            ))}
          </section>
        ))}
        {lootBases.length > 0 && (
          <section className="atlas-rt-note" aria-label={t('tables.settings.bases')}>
            <h4 className="atlas-rt-note__head"><Table /><span className="atlas-rt-note__name">{t('tables.settings.bases')}</span></h4>
            {lootBases.map((path) => (
              <BaseSourceRow
                key={path}
                path={path}
                base={bases.find((entry) => entry.path === path)}
                onRemove={() => onBasesChange(lootBases.filter((entry) => entry !== path))}
              />
            ))}
          </section>
        )}

        {adding === 'note' && <NoteTablePicker app={app} listed={listed} onAdd={addTables} onCancel={() => setAdding(null)} />}
        {adding === 'base' && (
          <div className="atlas-csm-loot-picker">
            <LinkedNotePicker app={app} files={baseFiles} noun="bases" icon={Table} onSelect={addBase} />
            <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setAdding(null)}>{t('common.cancel')}</Button>
          </div>
        )}
        {adding === null && (
          <div className="atlas-rt-add">
            <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setAdding('note')}>
              <Plus />
              {t('tables.settings.addNote')}
            </Button>
            <Button variant="ghost" className="atlas-csm-add-btn" onClick={() => setAdding('base')}>
              <Plus />
              {t('tables.settings.addBase')}
            </Button>
          </div>
        )}
      </div>

      <div className="atlas-csm-field atlas-csm-loot-currency atlas-rt-currency">
        <label className="atlas-csm-label" htmlFor="atlas-csm-loot-currency">{t('csm.loot.currency')}</label>
        <input
          id="atlas-csm-loot-currency"
          type="text"
          className="atlas-csm-input"
          placeholder={t('csm.loot.currencyPlaceholder')}
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
        />
      </div>

      <ItemRaritiesSection
        rarities={rarities}
        own={own !== undefined}
        onChange={(next) => props.onItemRaritiesChange(editedItemRarities(next, system))}
        onRevert={() => props.onItemRaritiesChange(undefined)}
      />
    </>
  );
}
