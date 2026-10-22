// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { fakeQueries } from '../../mocks/fakeLootQueries';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';
import { TableNoteReader, type CollectionTable } from '../../../src/app/randomTables/TableNoteReader';
import type { RandomTableSource } from '../../../src/app/types/randomTableTypes';
import { BREW_NOTE } from '../../fixtures/tableNotes';

vi.mock('../../../src/app/loot/lootQueryView', () => import('../../mocks/fakeLootQueries'));

const BREW = 'Adventures/Brew.md';
const RUMOURS: RandomTableSource = { path: BREW, table: '🗣️ Rumours in the Taproom', index: 1, kind: 'text' };
const ENCOUNTERS: RandomTableSource = { path: BREW, table: '🎲 Random Tunnel Encounters', index: 0, kind: 'text' };

interface Harness extends InMemoryApp {
  reader: TableNoteReader;
  latest: () => readonly CollectionTable[];
  frontmatter: Map<string, Record<string, unknown>>;
  metadataChanged: (path: string) => void;
}

function harness(files: Record<string, string>): Harness {
  const vault = createInMemoryApp({ files });
  const frontmatter = new Map<string, Record<string, unknown>>();
  const changed: ((file: TFile) => void)[] = [];
  const byLink = (link: string): string | undefined => [...vault.files.keys()]
    .find((path) => [link, `${link}.md`].some((name) => path === name || path.endsWith(`/${name}`)));
  Object.assign(vault.app.metadataCache, {
    /** As Obsidian resolves links: by path or name, with or without the `.md`. */
    getFirstLinkpathDest: (link: string) => {
      const path = byLink(link);
      return path ? new TFile(path) : null;
    },
    getFileCache: (file: TFile) => ({ frontmatter: frontmatter.get(file.path) }),
    on: (name: string, callback: (file: TFile) => void) => {
      if (name === 'changed') changed.push(callback);
      return {};
    },
  });
  let tables: readonly CollectionTable[] = [];
  const reader = new TableNoteReader(vault.app, (next) => { tables = next; }, 0);
  return {
    ...vault,
    reader,
    latest: () => tables,
    frontmatter,
    metadataChanged: (path) => { for (const callback of changed) callback(new TFile(path)); },
  };
}

const settled = async (h: Harness): Promise<readonly CollectionTable[]> => {
  await vi.waitFor(() => expect(h.latest().every((table) => table.status !== 'loading')).toBe(true));
  return h.latest();
};

beforeEach(() => fakeQueries.reset());
afterEach(() => vi.useRealTimers());

describe('the tables of a collection\'s notes', () => {
  it('reads each named table with its die and problems', async () => {
    const h = harness({ [BREW]: BREW_NOTE });
    h.reader.setSources([ENCOUNTERS, RUMOURS]);
    const [encounters, rumours] = await settled(h);
    expect(encounters).toMatchObject({ id: `${BREW}#0`, status: 'found', noteName: 'Brew' });
    expect(encounters!.table?.die?.label).toBe('d6');
    expect(rumours!.table?.columns).toEqual(['Rumour', 'True?']);
    h.reader.stop();
  });

  it('reads a note again after it is edited', async () => {
    const h = harness({ [BREW]: BREW_NOTE });
    h.reader.setSources([RUMOURS]);
    await settled(h);
    h.files.set(BREW, BREW_NOTE.replace('Hilda waters her ale down with holy water.', 'Hilda brews with river water.'));
    h.emit('modify', new TFile(BREW));
    await vi.waitFor(() => expect(h.latest()[0]!.table?.rows[1]!.cells[0]).toContain('river water'));
  });

  it('finds a table whose heading was renamed by its place, and says so', async () => {
    const h = harness({ [BREW]: BREW_NOTE.replace('## 🗣️ Rumours in the Taproom', '## Gossip') });
    h.reader.setSources([ENCOUNTERS, RUMOURS]);
    const [, rumours] = await settled(h);
    expect(rumours).toMatchObject({ status: 'renamed' });
    expect(rumours!.table?.name).toBe('Gossip');
  });

  it('never hands a table one of the note\'s other tables found by name', async () => {
    const withoutEncounters = BREW_NOTE.slice(BREW_NOTE.indexOf('## 🗣️'));
    const h = harness({ [BREW]: withoutEncounters });
    h.reader.setSources([ENCOUNTERS, { ...RUMOURS, index: 1 }]);
    const [encounters, rumours] = await settled(h);
    expect(encounters!.status).toBe('table-missing');
    expect(rumours).toMatchObject({ status: 'found' });
  });

  it('reports a deleted note, and finds a renamed one once the settings follow it', async () => {
    const h = harness({ [BREW]: BREW_NOTE });
    h.reader.setSources([RUMOURS]);
    await settled(h);
    h.files.delete(BREW);
    h.files.set('Archive/Brew.md', BREW_NOTE);
    h.emit('rename', new TFile('Archive/Brew.md'), BREW);
    await vi.waitFor(() => expect(h.latest()[0]!.status).toBe('note-missing'));
    h.reader.setSources([{ ...RUMOURS, path: 'Archive/Brew.md' }]);
    await vi.waitFor(() => expect(h.latest()[0]!.status).toBe('found'));
    h.files.delete('Archive/Brew.md');
    h.emit('delete', new TFile('Archive/Brew.md'));
    await vi.waitFor(() => expect(h.latest()[0]!.status).toBe('note-missing'));
  });

  it('gives Items tables the items of their rows, linked notes\' frontmatter included and followed', async () => {
    const note = '| Item | Price |\n| --- | --- |\n| [[Rope of Climbing]] | |\n| Torch | 1 cp |\n';
    const h = harness({ 'Gear.md': note, 'Items/Rope of Climbing.md': '' });
    h.frontmatter.set('Items/Rope of Climbing.md', { price: 50, rarity: 'Uncommon', weight: '3 lb' });
    h.reader.setSources([{ path: 'Gear.md', index: 0, kind: 'items' }]);
    const [gear] = await settled(h);
    expect(gear!.items).toEqual([
      { id: 'Items/Rope of Climbing.md', name: 'Rope of Climbing', source: ['Gear', 'Gear'], price: '50', rarity: 'Uncommon', properties: [{ label: 'weight', value: '3 lb' }] },
      { id: 'Gear.md', name: 'Torch', source: ['Gear', 'Gear'], price: '1 cp', properties: [] },
    ]);
    h.frontmatter.set('Items/Rope of Climbing.md', { price: 60 });
    h.metadataChanged('Items/Rope of Climbing.md');
    expect(h.latest()[0]!.items![0]).toMatchObject({ price: '60' });
  });
});

describe('a master table over Base views and a note table', () => {
  const BASE = 'views:\n  - type: table\n    name: Common\n  - type: table\n    name: Rare\n';
  const entry = (name: string): { path: string; name: string; values: Record<string, string> } =>
    ({ path: `Items/${name}.md`, name, values: { 'note.price': '5' } });

  it('resolves the views and tables its rows link', async () => {
    const h = harness({ 'Loot.base': BASE, 'Coins.md': '| Coins |\n| --- |\n| `2d6` gp |\n', 'Master.md': '' });
    const common = h.reader.resolver.resolve('Loot.base#Common', 'Master.md');
    await vi.waitFor(() => expect(fakeQueries.started).toHaveLength(2));
    fakeQueries.of('Common').listener.onSnapshot({ entries: [entry('Rope'), entry('Torch')], order: ['note.price'], displayNames: {} });
    fakeQueries.of('Rare').listener.onSnapshot({ entries: [entry('Ring')], order: ['note.price'], displayNames: {} });

    const view = await common;
    expect(view).toMatchObject({ kind: 'view', key: 'Loot.base#Common' });
    expect(view?.kind === 'view' && view.items.map((item) => item.name)).toEqual(['Rope', 'Torch']);
    const rare = await h.reader.resolver.resolve('Loot.base#Rare', 'Master.md');
    expect(rare?.kind === 'view' && rare.items.map((item) => item.name)).toEqual(['Ring']);
    expect(await h.reader.resolver.resolve('Loot.base#Mythic', 'Master.md')).toBeNull();
    expect(await h.reader.resolver.resolve('Coins', 'Master.md')).toMatchObject({ kind: 'table', key: 'Coins.md#0', notePath: 'Coins.md' });
    expect(await h.reader.resolver.resolve('Brew', 'Master.md')).toBeNull();
    h.reader.stop();
    expect(fakeQueries.started.every((query) => query.stopped)).toBe(true);
  });
});
