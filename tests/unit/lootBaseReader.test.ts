import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { isLootBaseLoaded, isLootBaseUnreadable, LootBaseReader, needsBases, type LootBase } from '../../src/app/loot/LootBaseReader';
import { fakeQueries as queries, LootBaseQuery } from '../mocks/fakeLootQueries';
import type { LootQuerySnapshot } from '../../src/app/loot/lootItem';

vi.mock('../../src/app/loot/lootQueryView', () => import('../mocks/fakeLootQueries'));

const BASE_YAML = `views:
  - type: table
    name: Weapons
  - type: cards
    name: Armor
`;

const SNAPSHOT: LootQuerySnapshot = {
  entries: [{ path: 'Items/Plate.md', name: 'Plate', values: { 'note.price': '300' } }],
  order: ['file.name', 'note.price'],
  displayNames: {},
};

function appWith(files: Record<string, string>): App {
  const app = new App();
  app.vault = {
    getAbstractFileByPath: (path: string) => (path in files ? new TFile(path) : null),
    cachedRead: (file: TFile) => Promise.resolve(files[file.path] ?? ''),
  };
  return app;
}

function reader(files: Record<string, string>, path = 'Loot/Items.base', app = appWith(files)): { reader: LootBaseReader; latest: () => LootBase | undefined } {
  let latest: LootBase | undefined;
  return { reader: new LootBaseReader(app, path, (base) => { latest = base; }), latest: () => latest };
}

/** A vault whose files are listed and, while `failing.on`, cannot be read: a file not on this device, one a sync tool holds. */
function appFailing(files: Record<string, string>, failing: { on: boolean }): App {
  const app = appWith(files);
  const read = app.vault.cachedRead;
  app.vault.cachedRead = (file: TFile) => (failing.on ? Promise.reject(new Error('The file is not on this device.')) : read(file));
  return app;
}

beforeEach(() => {
  queries.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LootBaseReader', () => {
  it('runs one query per view and fills each view with its items', async () => {
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();

    expect(latest()).toMatchObject({ name: 'Items', missing: false });
    expect(latest()?.views.map((view) => [view.id, view.status])).toEqual([
      ['Loot/Items.base#Weapons', 'loading'],
      ['Loot/Items.base#Armor', 'loading'],
    ]);

    queries.of('Armor').listener.onSnapshot(SNAPSHOT);
    const armor = latest()?.views[1];
    expect(armor?.status).toBe('ready');
    expect(armor?.items).toEqual([{ id: 'Items/Plate.md', name: 'Plate', source: ['Items', 'Armor'], price: '300', properties: [] }]);
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(false);

    queries.of('Weapons').listener.onSnapshot({ ...SNAPSHOT, entries: [] });
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
  });

  it('keeps a view as it was when Obsidian reports the same items again', async () => {
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();
    queries.of('Armor').listener.onSnapshot(SNAPSHOT);
    const before = latest();

    queries.of('Armor').listener.onSnapshot({ ...SNAPSHOT, entries: [...SNAPSHOT.entries] });
    expect(latest()).toBe(before);
  });

  it('reports a base that is not in the vault', async () => {
    const { reader: items, latest } = reader({});
    await items.load();
    expect(latest()).toMatchObject({ missing: true, views: [] });
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
  });

  it('says a base that is no YAML could not be read, and reads it once it is', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const files = { 'Loot/Items.base': 'views: [unclosed' };
    const { reader: items, latest } = reader(files);
    await items.load();
    expect(latest()).toMatchObject({ name: 'Items', missing: false, unreadable: true, views: [] });
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(true);
    expect(queries.started).toHaveLength(0);

    files['Loot/Items.base'] = BASE_YAML;
    await items.load();
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(false);
    expect(latest()?.views.map((view) => view.status)).toEqual(['loading', 'loading']);
  });

  it('reads an empty base as one without views', async () => {
    for (const text of ['', '# Nothing yet\n']) {
      const { reader: items, latest } = reader({ 'Loot/Items.base': text });
      await items.load();
      expect(latest()).toMatchObject({ missing: false, views: [] });
      expect(isLootBaseUnreadable(latest() as LootBase)).toBe(false);
    }
  });

  it('says a base whose file cannot be read could not be read, instead of reading for ever', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const files = { 'Loot/Items.base': BASE_YAML };
    const failing = { on: true };
    const { reader: items, latest } = reader(files, 'Loot/Items.base', appFailing(files, failing));
    await expect(items.load()).resolves.toBeUndefined();

    expect(latest()).toMatchObject({ name: 'Items', missing: false, unreadable: true, views: [] });
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(true);
    expect(needsBases(latest() as LootBase)).toBe(false);
    expect(queries.started).toHaveLength(0);

    // The file is read anew when the vault says it changed.
    failing.on = false;
    await items.load();
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(false);
    queries.of('Weapons').listener.onSnapshot(SNAPSHOT);
    queries.of('Armor').listener.onSnapshot(SNAPSHOT);
    expect(latest()?.views.map((view) => view.status)).toEqual(['ready', 'ready']);
  });

  it('reports a base deleted while it was read as not in the vault', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const files: Record<string, string> = { 'Loot/Items.base': BASE_YAML };
    const app = appWith(files);
    app.vault.cachedRead = () => {
      delete files['Loot/Items.base'];
      return Promise.reject(new Error('ENOENT'));
    };
    const { reader: items, latest } = reader(files, 'Loot/Items.base', app);
    await items.load();
    expect(latest()).toMatchObject({ missing: true, views: [] });
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(false);
  });

  it('leaves a read that failed after the base was read again out of what it reports', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const files = { 'Loot/Items.base': BASE_YAML };
    const app = appWith(files);
    const read = app.vault.cachedRead;
    let fail = (_error: Error): void => undefined;
    app.vault.cachedRead = () => new Promise<string>((_resolve, reject) => { fail = reject; });
    const { reader: items, latest } = reader(files, 'Loot/Items.base', app);
    const first = items.load();

    app.vault.cachedRead = read;
    await items.load();
    fail(new Error('The file is not on this device.'));
    await first;
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(false);
    expect(latest()?.views.map((view) => view.name)).toEqual(['Weapons', 'Armor']);
  });

  it('marks every view unavailable without running queries while Bases is off', async () => {
    queries.available = false;
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();

    expect(queries.started).toHaveLength(0);
    expect(latest()?.views.map((view) => view.status)).toEqual(['unavailable', 'unavailable']);
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
    expect(needsBases(latest() as LootBase)).toBe(true);
  });

  it('marks a view Obsidian cannot run, and takes its items should they come after all', async () => {
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();

    queries.of('Weapons').listener.onUnavailable();
    expect(latest()?.views[0]?.status).toBe('unavailable');
    expect(needsBases(latest() as LootBase)).toBe(true);

    queries.of('Weapons').listener.onSnapshot(SNAPSHOT);
    expect(latest()?.views[0]?.status).toBe('ready');
    expect(needsBases(latest() as LootBase)).toBe(false);
  });

  it('stops reading a view whose results cannot be read, and takes its items should they come after all', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();
    queries.of('Armor').listener.onSnapshot(SNAPSHOT);

    queries.of('Weapons').listener.onUnreadable(new Error('no order'));
    expect(latest()?.views.map((view) => view.status)).toEqual(['unreadable', 'ready']);
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(true);
    expect(needsBases(latest() as LootBase)).toBe(false);

    queries.of('Weapons').listener.onSnapshot(SNAPSHOT);
    expect(latest()?.views[0]?.status).toBe('ready');
    expect(isLootBaseUnreadable(latest() as LootBase)).toBe(false);
  });

  it('stops reading a view whose rows are no rows', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();

    queries.of('Weapons').listener.onSnapshot({ ...SNAPSHOT, entries: null } as unknown as LootQuerySnapshot);
    expect(latest()?.views[0]).toMatchObject({ status: 'unreadable', items: [] });
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(false);
    queries.of('Armor').listener.onSnapshot(SNAPSHOT);
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
  });

  it('stops reading a view Obsidian fails to start, and reads the others', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(LootBaseQuery.prototype, 'start').mockRejectedValueOnce(new Error('render failed'));
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();

    expect(latest()?.views.map((view) => view.status)).toEqual(['unreadable', 'loading']);
    queries.of('Armor').listener.onSnapshot(SNAPSHOT);
    expect(latest()?.views.map((view) => view.status)).toEqual(['unreadable', 'ready']);
    expect(isLootBaseLoaded(latest() as LootBase)).toBe(true);
  });

  it('stops its queries and ignores their late results', async () => {
    const { reader: items, latest } = reader({ 'Loot/Items.base': BASE_YAML });
    await items.load();
    const before = latest();
    items.stop();

    expect(queries.started.every((entry) => entry.stopped)).toBe(true);
    queries.of('Weapons').listener.onSnapshot(SNAPSHOT);
    expect(latest()).toBe(before);
  });

  it('replaces its queries when the base is read again', async () => {
    const files = { 'Loot/Items.base': BASE_YAML };
    const { reader: items, latest } = reader(files);
    await items.load();
    const first = [...queries.started];

    files['Loot/Items.base'] = 'views:\n  - type: table\n    name: Rings\n';
    await items.load();

    expect(first.every((entry) => entry.stopped)).toBe(true);
    expect(latest()?.views.map((view) => view.name)).toEqual(['Rings']);
    first[0]?.listener.onSnapshot(SNAPSHOT);
    expect(latest()?.views.map((view) => view.name)).toEqual(['Rings']);
  });
});
