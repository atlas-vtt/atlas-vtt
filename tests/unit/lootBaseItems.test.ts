import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { readLootBaseItems } from '../../src/app/loot/lootBaseItems';
import { fakeQueries as queries } from '../mocks/fakeLootQueries';
import type { LootQuerySnapshot } from '../../src/app/loot/lootItem';

vi.mock('../../src/app/loot/lootQueryView', () => import('../mocks/fakeLootQueries'));

const BASE = 'Loot/Items.base';
const BASE_YAML = 'views:\n  - type: table\n    name: Weapons\n  - type: table\n    name: Armor\n';

const snapshot = (...paths: string[]): LootQuerySnapshot => ({
  entries: paths.map((path) => ({ path, name: path, values: {} })), order: [], displayNames: {},
});

function appWith(files: Record<string, string>): App {
  const app = new App();
  app.vault = {
    getAbstractFileByPath: (path: string) => (path in files ? new TFile(path) : null),
    cachedRead: (file: TFile) => Promise.resolve(files[file.path] ?? ''),
  };
  return app;
}

/** Lets the reader read the base file and start its queries. */
const started = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

beforeEach(() => { queries.reset(); });

describe('readLootBaseItems', () => {
  it('answers with every item once all views were read, each item once, and stops the queries', async () => {
    const items = readLootBaseItems(appWith({ [BASE]: BASE_YAML }), BASE);
    await started();
    queries.of('Weapons').listener.onSnapshot(snapshot('Items/Sword.md', 'Items/Shield.md'));
    queries.of('Armor').listener.onSnapshot(snapshot('Items/Shield.md', 'Items/Plate.md'));

    expect(await items).toEqual(['Items/Sword.md', 'Items/Shield.md', 'Items/Plate.md']);
    expect(queries.started.every((query) => query.stopped)).toBe(true);
  });

  it('adds the files the base holds by its own filters that no view shows', async () => {
    const yaml = `filters:\n  and:\n    - file.inFolder("Items")\n${BASE_YAML}`;
    const items = readLootBaseItems(appWith({ [BASE]: yaml }), BASE);
    await started();
    queries.of('Weapons').listener.onSnapshot(snapshot('Items/Sword.md'));
    queries.of('Armor').listener.onSnapshot(snapshot());
    queries.of('atlas-loot').listener.onSnapshot(snapshot('Items/Sword.md', 'Items/Unsorted/Rope.md'));

    expect(await items).toEqual(['Items/Sword.md', 'Items/Unsorted/Rope.md']);
    expect(queries.started.every((query) => query.stopped)).toBe(true);
  });

  it('answers with no items for a base without views', async () => {
    expect(await readLootBaseItems(appWith({ [BASE]: 'filters:\n  and: []\n' }), BASE)).toEqual([]);
  });

  it('answers null, and stops, for a base with a view whose results cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const items = readLootBaseItems(appWith({ [BASE]: BASE_YAML }), BASE);
    await started();
    queries.of('Weapons').listener.onSnapshot(snapshot('Items/Sword.md'));
    queries.of('Armor').listener.onUnreadable(new Error('no rows'));

    expect(await items).toBeNull();
    expect(queries.started.every((query) => query.stopped)).toBe(true);
    vi.restoreAllMocks();
  });

  it('answers null for a base that is gone, and while Bases is off', async () => {
    expect(await readLootBaseItems(appWith({}), BASE)).toBeNull();
    queries.available = false;
    expect(await readLootBaseItems(appWith({ [BASE]: BASE_YAML }), BASE)).toBeNull();
  });
});
