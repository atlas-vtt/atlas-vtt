import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import {
  DEFAULT_ITEM_RARITIES, collectionItemRarities, editedItemRarities, parseItemRarities, sameItemRarities,
} from '../../../src/app/gameSystems/itemRarities';
import { parseSystemRules } from '../../../src/app/gameSystems/presetValidation';
import { sameSystemRules, vanillaSystemSettings } from '../../../src/app/gameSystems/systemRules';
import { tablesFolder } from '../../../src/app/randomTables/tablePaths';
import {
  readRandomTables, storedRandomTable, withMovedTableNotes, withRandomTable, withRandomTableChanged, withRestoredRandomTable,
  withoutRandomTable,
} from '../../../src/app/randomTables/tableSettings';
import { isReservedCollectionPath } from '../../../src/app/services/vault-sync/reservedPaths';
import type { CollectionSettings } from '../../../src/app/types/collectionSettingsTypes';
import type { RandomTableSource } from '../../../src/app/types/randomTableTypes';

/** Settings as `collection.json` may hold them, written by any Atlas or by hand. */
const stored = (randomTables: unknown): Pick<CollectionSettings, 'randomTables'> =>
  JSON.parse(JSON.stringify({ randomTables })) as Pick<CollectionSettings, 'randomTables'>;

const RUMOURS: RandomTableSource = { path: 'Adventures/Brew.md', table: 'Rumours', index: 1, kind: 'text', hiddenColumns: ['True?'] };

describe('reading the tables of a collection', () => {
  it('reads usable entries and leaves out the rest', () => {
    const settings = stored([
      RUMOURS,
      { path: 'Weather.md', index: 0, kind: 'items', noRepeats: true, hiddenColumns: ['Wt', 3, 'Wt'] },
      { path: 'Weather.md', index: 0, kind: 'text' },
      { path: '', index: 0, kind: 'text' },
      { path: 'Odd.md', index: -1, kind: 'text' },
      { path: 'Odd.md', index: 1.5, kind: 'text' },
      { path: 'Odd.md', index: 99, kind: 'text' },
      { path: 'Odd.md', index: 0, kind: 'npcs' },
      { path: 'Odd.md', index: 0, kind: 'text', noRepeats: 'yes', table: 4 },
      'Odd.md',
      null,
    ]);
    expect(readRandomTables(settings)).toEqual([
      RUMOURS,
      { path: 'Weather.md', index: 0, kind: 'items', noRepeats: true, hiddenColumns: ['Wt'] },
      { path: 'Odd.md', index: 0, kind: 'text' },
    ]);
  });

  it('reads the name the GM gave a table, trimmed and bounded, and none that is blank or no text', () => {
    const settings = stored([
      { ...RUMOURS, label: '  Tavern talk ' },
      { path: 'Long.md', index: 0, kind: 'text', label: 'x'.repeat(300) },
      { path: 'Blank.md', index: 0, kind: 'text', label: '   ' },
      { path: 'Odd.md', index: 0, kind: 'text', label: 7 },
    ]);
    expect(readRandomTables(settings).map((source) => source.label)).toEqual(['Tavern talk', 'x'.repeat(200), undefined, undefined]);
  });

  it('reads nothing from a value that is no list', () => {
    expect(readRandomTables(stored({ path: 'A.md' }))).toEqual([]);
    expect(readRandomTables({})).toEqual([]);
  });
});

describe('writing the tables of a collection', () => {
  it('changes an entry as stored now, its fields of a newer Atlas kept, and never adds one that is gone', () => {
    const settings = stored([{ ...RUMOURS, future: 1 }]);
    expect(withRandomTableChanged(settings, RUMOURS.path, 1, (source) => ({ ...source, label: 'Talk' })))
      .toEqual([{ ...RUMOURS, future: 1, label: 'Talk' }]);
    expect(withRandomTableChanged(settings, 'Gone.md', 0, (source) => source)).toBeNull();
  });

  it('puts a removed entry back where it was, whole, unless the table is listed again', () => {
    const later = { path: 'Later.md', index: 0, kind: 'npcs' };
    const settings = stored([later, { ...RUMOURS, future: 1 }]);
    const removed = storedRandomTable(settings, RUMOURS.path, 1)!;
    expect(removed.at).toBe(1);
    const without = stored(withoutRandomTable(settings, RUMOURS.path, 1));
    expect(withRestoredRandomTable(without, removed.entry, removed.at)).toEqual([later, { ...RUMOURS, future: 1 }]);
    expect(withRestoredRandomTable(settings, removed.entry, removed.at)).toEqual(settings.randomTables);
  });

  it('changes one entry and keeps the fields of a newer Atlas', () => {
    const settings = stored([{ ...RUMOURS, players: 'roll', columns: { 'True?': 'secret' } }, { path: 'Later.md', index: 0, kind: 'npcs' }]);
    const next = withRandomTable(settings, { path: RUMOURS.path, table: 'Rumours', index: 1, kind: 'text', noRepeats: true });
    expect(next).toEqual([
      { path: RUMOURS.path, table: 'Rumours', index: 1, kind: 'text', noRepeats: true, players: 'roll', columns: { 'True?': 'secret' } },
      { path: 'Later.md', index: 0, kind: 'npcs' },
    ]);
  });

  it('adds a table at the end', () => {
    expect(withRandomTable(stored([RUMOURS]), { path: 'Gems.md', index: 0, kind: 'items' })).toEqual([
      RUMOURS,
      { path: 'Gems.md', index: 0, kind: 'items' },
    ]);
  });

  it('removes one table and keeps the others as stored', () => {
    expect(withoutRandomTable(stored([RUMOURS, { path: 'Later.md', index: 0, kind: 'npcs' }]), RUMOURS.path, 1))
      .toEqual([{ path: 'Later.md', index: 0, kind: 'npcs' }]);
  });

  it('follows moved notes, every field kept', () => {
    const settings = stored([{ ...RUMOURS, players: 'roll' }, { path: 'Stay.md', index: 0, kind: 'text' }]);
    const moved = (path: string): string | null => (path === RUMOURS.path ? 'Moved/Brew.md' : null);
    expect(withMovedTableNotes(settings, moved)).toEqual([
      { ...RUMOURS, path: 'Moved/Brew.md', players: 'roll' },
      { path: 'Stay.md', index: 0, kind: 'text' },
    ]);
    expect(withMovedTableNotes(settings, () => null)).toBeNull();
  });
});

describe('the folder of table notes', () => {
  it('is Atlas\' own: the vault check never takes a note there for an asset', () => {
    expect(tablesFolder('Cairn')).toBe('atlas-vtt/collections/Cairn/tables');
    expect(isReservedCollectionPath('atlas-vtt/collections/Cairn/tables/Weather.md')).toBe(true);
    expect(isReservedCollectionPath('atlas-vtt/collections/Cairn/tokens/Weather.md')).toBe(false);
  });
});

describe('item rarities', () => {
  const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:dnd5e')!;
  const pf2e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:pathfinder2e')!;
  const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:cairn')!;

  it('reads the collection\'s own words, else its preset\'s, else the ladder', () => {
    const own = [{ name: 'Junk', tone: null }, { name: 'Relic', tone: 'legendary' }] as const;
    expect(collectionItemRarities({ itemRarities: [...own], systemPresetId: pf2e.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual(own);
    expect(collectionItemRarities({ systemPresetId: pf2e.id }, BUILT_IN_SYSTEM_PRESETS).map((option) => option.name))
      .toEqual(['Common', 'Uncommon', 'Rare', 'Unique']);
    expect(collectionItemRarities({ systemPresetId: cairn.id }, BUILT_IN_SYSTEM_PRESETS)).toBe(DEFAULT_ITEM_RARITIES);
    expect(collectionItemRarities({}, BUILT_IN_SYSTEM_PRESETS)).toBe(DEFAULT_ITEM_RARITIES);
  });

  it('reads stored words, which arrive unchecked', () => {
    expect(parseItemRarities([
      { name: ' Common ', tone: 'common' },
      { name: 'common', tone: 'rare' },
      { name: 'Odd', tone: 'purple' },
      { name: '', tone: 'rare' },
      { tone: 'rare' },
      'Rare',
    ])).toEqual([{ name: 'Common', tone: 'common' }, { name: 'Odd', tone: null }]);
    expect(parseItemRarities([])).toEqual([]);
    expect(parseItemRarities('Common')).toBeUndefined();
  });

  it('stores nothing for an edit that ends at the system\'s words', () => {
    const system = pf2e.rules.itemRarities!;
    expect(editedItemRarities([...system], system)).toBeUndefined();
    expect(editedItemRarities(system.slice(0, 2), system)).toEqual(system.slice(0, 2));
    expect(sameItemRarities(system, [...system].reverse())).toBe(false);
  });

  it('counts own words that differ from the preset\'s as an edit of the rules', () => {
    const rules = { ...dnd5e.rules };
    expect(sameSystemRules(dnd5e.rules, rules)).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...rules, itemRarities: [...DEFAULT_ITEM_RARITIES] })).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...rules, itemRarities: [{ name: 'Common', tone: 'common' }] })).toBe(false);
  });

  it('keeps a preset\'s words through its file, and a collection without a system has none of its own', () => {
    expect(parseSystemRules(JSON.parse(JSON.stringify(pf2e.rules)))?.itemRarities).toEqual(pf2e.rules.itemRarities);
    expect(vanillaSystemSettings()).toHaveProperty('itemRarities', undefined);
  });
});
