// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { LOOT_HISTORY_LIMIT, readLootHistory, type LootRoll } from '../../src/app/loot/lootHistory';
import { LootHistoryStore } from '../../src/app/loot/LootHistoryStore';
import { mergeLootHistories, readDeviceLootHistory, withoutRoll, clearedHistory } from '../../src/app/loot/deviceLootHistory';
import { deviceLootHistoryPath, legacyLootHistoryPath, lootHistoryCollectionOf } from '../../src/app/loot/lootHistoryPaths';
import { deviceId } from '../../src/app/plugin/deviceId';
import { isAdoptableJson } from '../../src/app/services/vault-sync/assetAdoption';
import { isReservedCollectionPath } from '../../src/app/services/vault-sync/reservedPaths';

function roll(id: string, mapName = 'Crypt', rolledAt = 1): LootRoll {
  return { id, rolledAt, mapName, draws: [{ id: `${id}-1`, notePath: 'Loot.md', source: ['Loot'], name: 'Rope', properties: [] }] };
}

describe('readLootHistory', () => {
  it('keeps valid rolls and drops broken rolls and items', () => {
    const broken = { ...roll('b'), draws: [{ id: 'x' }] };
    const partly = { ...roll('c'), draws: [...roll('c').draws, { name: 'no id' }] };
    expect(readLootHistory({ format: 1, rolls: [roll('a'), broken, partly, 'junk'] })).toEqual([roll('a'), roll('c')]);
    expect(readLootHistory('junk')).toEqual([]);
  });

  it('keeps at most the history limit', () => {
    const rolls = Array.from({ length: LOOT_HISTORY_LIMIT + 5 }, (_, i) => roll(`r${i}`));
    expect(readLootHistory({ rolls })).toHaveLength(LOOT_HISTORY_LIMIT);
  });
});

const OTHER_DEVICE = 'other-device';
const otherPath = deviceLootHistoryPath('dh', OTHER_DEVICE);

/** A vault with this device's id fixed and, optionally, files another device synced. */
function vaultWith(files: Record<string, string> = {}): { vault: InMemoryApp; ownPath: string } {
  const vault = createInMemoryApp({ files });
  const ownPath = deviceLootHistoryPath('dh', deviceId(vault.app));
  return { vault, ownPath };
}

const fileOf = (rolls: LootRoll[], extra: Record<string, unknown> = {}): string => JSON.stringify({ format: 1, rolls, ...extra });
const ids = (rolls: readonly LootRoll[]): string[] => rolls.map((entry) => entry.id);

describe('device id', () => {
  it('is made once per device and kept in local storage', () => {
    const { app, localStorage } = createInMemoryApp();
    const id = deviceId(app);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(deviceId(app)).toBe(id);
    expect([...localStorage.values()]).toContain(id);
    expect(deviceId(createInMemoryApp().app)).not.toBe(id);
  });
});

describe('merging the devices\' histories', () => {
  it('shows every roll once, newest first, without those removed anywhere', () => {
    const mine = readDeviceLootHistory({ rolls: [roll('a', 'X', 5), roll('shared', 'X', 3)], removed: ['b', 'c'] });
    const theirs = readDeviceLootHistory({ rolls: [roll('b', 'Y', 6), roll('shared', 'Y', 3), roll('c', 'Y', 1)] });
    expect(ids(mergeLootHistories([mine, theirs]))).toEqual(['a', 'shared']);
  });

  it('clears by naming the rolls there are, so a roll another device makes afterwards stays whatever its clock says', () => {
    const theirs = readDeviceLootHistory({ rolls: [roll('b', 'Y', 6)] });
    const mine = clearedHistory([theirs]);
    const later = readDeviceLootHistory({ rolls: [roll('late', 'Y', 1), roll('b', 'Y', 6)] });
    expect(ids(mergeLootHistories([mine, later]))).toEqual(['late']);
  });

  it('marks another device\'s roll as removed and drops its own', () => {
    const mine = readDeviceLootHistory({ rolls: [roll('a')] });
    const theirs = readDeviceLootHistory({ rolls: [roll('b')] });
    expect(withoutRoll(mine, [theirs], 'a')).toMatchObject({ rolls: [], removed: [] });
    expect(withoutRoll(mine, [theirs], 'b')).toMatchObject({ rolls: [roll('a')], removed: ['b'] });
  });
});

describe('LootHistoryStore', () => {
  afterEach(() => vi.useRealTimers());

  it('shares the rolls of a collection between its maps and saves this device\'s file once after a pause', async () => {
    vi.useFakeTimers();
    const { vault, ownPath } = vaultWith();
    await vault.app.vault.create(ownPath, fileOf([roll('old')]));
    vi.mocked(vault.app.vault.process).mockClear();
    const store = LootHistoryStore.forApp(vault.app);
    const seen: string[][] = [];
    store.subscribe('dh', (rolls) => seen.push(ids(rolls)));

    expect(ids(await store.load('dh'))).toEqual(['old']);
    store.add('dh', roll('new', 'Forest', 2));
    store.add('dh', roll('newer', 'Tower', 3));
    await vi.waitFor(() => expect(seen.at(-1)).toEqual(['newer', 'new', 'old']));
    expect(vault.app.vault.process).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(vault.app.vault.process).toHaveBeenCalledTimes(1);
    const saved = readLootHistory(JSON.parse(vault.files.get(ownPath) ?? '{}'));
    expect(saved.map((entry) => entry.mapName)).toEqual(['Tower', 'Forest', 'Crypt']);
    expect(JSON.parse(vault.files.get(ownPath)!)).toMatchObject({ format: 1 });

    store.remove('dh', 'new');
    store.clear('other');
    await vi.advanceTimersByTimeAsync(1000);
    expect(ids(await store.load('dh'))).toEqual(['newer', 'old']);
    expect(await store.load('other')).toEqual([]);
    LootHistoryStore.release(vault.app);
  });

  it('merges the rolls every device wrote and writes only its own file', async () => {
    const { vault, ownPath } = vaultWith({ [otherPath]: fileOf([roll('theirs', 'Inn', 5)]) });
    const store = LootHistoryStore.forApp(vault.app);
    expect(ids(await store.load('dh'))).toEqual(['theirs']);

    store.add('dh', roll('mine', 'Crypt', 6));
    store.remove('dh', 'theirs');
    LootHistoryStore.release(vault.app);

    await vi.waitFor(() => expect(vault.files.has(ownPath)).toBe(true));
    expect(vault.files.get(otherPath)).toBe(fileOf([roll('theirs', 'Inn', 5)]));
    expect(JSON.parse(vault.files.get(ownPath)!)).toMatchObject({ rolls: [roll('mine', 'Crypt', 6)], removed: ['theirs'] });
    expect(ids(await LootHistoryStore.forApp(vault.app).load('dh'))).toEqual(['mine']);
    LootHistoryStore.release(vault.app);
  });

  it('follows another device\'s file as sync brings it, without a restart', async () => {
    const { vault } = vaultWith();
    const store = LootHistoryStore.forApp(vault.app);
    const seen: string[][] = [];
    store.subscribe('dh', (rolls) => seen.push(ids(rolls)));
    await store.load('dh');

    vault.files.set(otherPath, fileOf([roll('synced', 'Inn', 4)]));
    vault.emit('create', new TFile(otherPath));
    await vi.waitFor(() => expect(seen.at(-1)).toEqual(['synced']));

    vault.files.delete(otherPath);
    vault.emit('delete', new TFile(otherPath));
    await vi.waitFor(() => expect(seen.at(-1)).toEqual([]));

    LootHistoryStore.release(vault.app);
    vault.files.set(otherPath, fileOf([roll('late')]));
    vault.emit('create', new TFile(otherPath));
    expect(seen.at(-1)).toEqual([]);
  });

  it('takes the rolls of the old single history file into this device\'s file once', async () => {
    const legacy = legacyLootHistoryPath('dh');
    const { vault, ownPath } = vaultWith({ [legacy]: fileOf([roll('before', 'Crypt', 2)]) });
    // Sync tools that carry hidden folders gave the other device the same old file, and it carried it over too.
    await vault.app.vault.create(otherPath, fileOf([roll('before', 'Crypt', 2)]));
    const store = LootHistoryStore.forApp(vault.app);
    expect(ids(await store.load('dh'))).toEqual(['before']);
    await vi.waitFor(() => expect(vault.files.has(ownPath)).toBe(true));
    expect(ids(readLootHistory(JSON.parse(vault.files.get(ownPath)!)))).toEqual(['before']);

    store.remove('dh', 'before');
    LootHistoryStore.release(vault.app);
    await vi.waitFor(() => expect(ids(readLootHistory(JSON.parse(vault.files.get(ownPath)!)))).toEqual([]));
    // Removed here and done once: the old file does not bring the roll back.
    expect(ids(await LootHistoryStore.forApp(vault.app).load('dh'))).toEqual([]);
    LootHistoryStore.release(vault.app);
  });
});

describe('loot history paths', () => {
  it('lie in the collection folder, outside the assets, and name their collection', () => {
    expect(otherPath).toBe('atlas-vtt/collections/dh/loot-history/other-device.json');
    expect(lootHistoryCollectionOf(otherPath)).toBe('dh');
    expect(lootHistoryCollectionOf('atlas-vtt/collections/dh/scenes/x.json')).toBeNull();
    expect(isReservedCollectionPath(otherPath)).toBe(true);
    expect(isAdoptableJson(otherPath)).toBe(false);
  });
});
