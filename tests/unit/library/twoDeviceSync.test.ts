// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssetService, type Asset } from '../../../src/app/services/AssetService';
import { transferAssets } from '../../../src/app/services/assetTransfer/assetTransfer';
import { COPY_SETTLE_MS, libraryClock } from '../../../src/app/services/library/libraryState';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';
import { FakeSync, seededRandom } from './fakeSync';

/**
 * Two devices edit one library while a file sync carries their files between
 * them, sometimes after long offline stretches; edits made on both sides at
 * once lose one side as sync tools do. Whatever happens, once the sync has
 * settled both devices must hold the same library, each must hold what its
 * files say, and no record nobody deleted may be lost.
 */

const TRIALS = Number(import.meta.env.VITE_LIBRARY_SYNC_TRIALS ?? 12);
const STEPS = 30;
const COLLECTION = 'Fen';
/** Names both devices may give new collections, so the same name is made on both at once. */
const NEW_COLLECTIONS = ['Hills', 'Marsh', 'Crypt'];

interface Device {
  name: string;
  vault: InMemoryApp;
  assets: AssetService;
}

function startDevice(name: string, files: Record<string, string> = {}, folders: readonly string[] = []): Promise<Device> {
  AssetService.resetInstance();
  const vault = createInMemoryApp({ files, folders: ['atlas-vtt/collections', ...folders] });
  const assets = AssetService.getInstance(vault.app);
  return assets.initialize().then(() => ({ name, vault, assets }));
}

const isSynced = (path: string): boolean => !path.split('/').some((part) => part.startsWith('.'));
const synced = (vault: InMemoryApp): Record<string, string> => Object.fromEntries([...vault.files].filter(([path]) => isSynced(path)));
const syncedFolders = (vault: InMemoryApp): string[] => [...vault.folders].filter(isSynced);

/** What two devices must agree on about each record. */
async function library(assets: AssetService): Promise<Record<string, unknown>> {
  const records = await assets.getAssets();
  const collections = await assets.getCollections();
  return {
    assets: Object.fromEntries(records.map((asset: Asset) => [asset.id, { type: asset.type, name: asset.name, tags: asset.tags, collection: asset.collection }])),
    collections: Object.fromEntries(collections.map((collection) => [collection.id, { uid: collection.uid, conditions: collection.settings.conditions }])),
  };
}

class Trial {
  private serial = 0;
  readonly created = new Set<string>();
  readonly deleted = new Set<string>();

  constructor(private readonly random: () => number) {}

  private pick<T>(items: readonly T[]): T | undefined {
    return items.length === 0 ? undefined : items[Math.floor(this.random() * items.length)];
  }

  /** One edit a GM might make on `device`: mostly to records, now and then to collections. */
  async edit(device: Device): Promise<void> {
    if (this.random() < 0.12) await this.editCollections(device);
    else await this.editRecords(device);
  }

  private async editCollections(device: Device): Promise<void> {
    const { assets, vault } = device;
    const others = (await assets.getCollections()).filter((collection) => collection.id !== COLLECTION && collection.id !== assets.getDefaultCollectionId());
    const roll = this.random();
    if (roll < 0.4) {
      const name = this.pick(NEW_COLLECTIONS.filter((candidate) => !vault.folders.has(`atlas-vtt/collections/${candidate}`)));
      if (name) await assets.createCollection(name);
    } else if (roll < 0.7) {
      const collection = this.pick(others);
      const name = this.pick(NEW_COLLECTIONS.map((candidate) => `${candidate} ${device.name}${++this.serial}`));
      if (collection && name) await assets.renameCollection(collection.id, name);
    } else if (roll < 0.85) {
      const target = this.pick(others);
      const token = this.pick(await assets.getAssets(COLLECTION, 'token'));
      if (target && token) await transferAssets(vault.app, assets, { assetIds: [token.id], targetCollectionId: target.id, mode: 'move' });
    } else {
      // The file manager copies a collection's folder: Atlas sees only the new files.
      const source = this.pick(others);
      if (!source) return;
      const from = `atlas-vtt/collections/${source.id}/`;
      const to = `atlas-vtt/collections/${source.id} copy ${device.name}${++this.serial}/`;
      for (const [path, content] of [...vault.files]) {
        if (path.startsWith(from)) await vault.app.vault.adapter.write(to + path.slice(from.length), content);
      }
      await assets.reconcileWithVault();
    }
  }

  private async editRecords(device: Device): Promise<void> {
    const { assets, vault } = device;
    const tokens = await assets.getAssets(COLLECTION, 'token');
    const encounters = await assets.getAssets(COLLECTION, 'encounter');
    const roll = this.random();
    const n = `${device.name}${++this.serial}`;
    if (roll < 0.25) {
      const imagePath = `atlas-vtt/collections/${COLLECTION}/tokens/${n}.webp`;
      await vault.app.vault.create(imagePath, `IMG ${n}`);
      this.created.add((await assets.addTokenAsset({ name: `Token ${n}`, imagePath, collection: COLLECTION, tags: [] })).id);
    } else if (roll < 0.4) {
      const token = this.pick(tokens);
      if (token) await assets.updateAsset(token.id, { name: `Renamed ${n}` });
    } else if (roll < 0.5) {
      const token = this.pick(tokens);
      if (token) await assets.updateAssetTags(token.id, [...token.tags, `tag-${n}`]);
    } else if (roll < 0.58) {
      const token = this.pick(tokens);
      if (token) {
        this.deleted.add(token.id);
        // An encounter left without tokens goes with its last one.
        for (const group of await assets.getGroupsUsingTokens([token.id])) this.deleted.add(group.id);
        await assets.deleteAsset(token.id);
      }
    } else if (roll < 0.72) {
      const token = this.pick(tokens);
      const refs = token ? [{ id: token.id, name: token.name, imagePath: token.imagePath }] : [];
      const encounter = await assets.createEncounter({ name: `Encounter ${n}`, collection: COLLECTION, tags: [], tokens: refs });
      this.created.add(encounter.id);
    } else if (roll < 0.82) {
      const encounter = this.pick(encounters);
      if (encounter) await assets.updateAsset(encounter.id, { name: `Fight ${n}`, data: { ...encounter.data, description: `Edited ${n}` } });
    } else if (roll < 0.87) {
      const encounter = this.pick(encounters);
      if (encounter) {
        this.deleted.add(encounter.id);
        await assets.deleteAsset(encounter.id);
      }
    } else {
      const conditions = [...assets.getCollectionSettings(COLLECTION).conditions, { id: `c-${n}`, name: `Condition ${n}`, color: '#fff' }];
      await assets.updateCollectionSettings(COLLECTION, { conditions });
    }
  }
}

/** The clock copied files are timed by; exchanges move it on. */
let clock = 0;
const realClock = libraryClock.now;
beforeAll(() => { libraryClock.now = (): number => clock; });
afterAll(() => { libraryClock.now = realClock; });

/** Exchanges files and lets both devices check them, as the vault events would, until nothing changes; copied files have time to stand. */
async function settle(sync: FakeSync, devices: readonly [Device, Device]): Promise<void> {
  for (let round = 0; round < 8; round++) {
    clock += COPY_SETTLE_MS;
    const before = JSON.stringify([synced(devices[0].vault), synced(devices[1].vault)]);
    const outcome = await sync.exchange();
    await devices[0].assets.reconcileWithVault(outcome.deletedOn[0]);
    await devices[1].assets.reconcileWithVault(outcome.deletedOn[1]);
    if (!outcome.changed && JSON.stringify([synced(devices[0].vault), synced(devices[1].vault)]) === before) return;
  }
  throw new Error('The two devices kept changing their files');
}

async function runTrial(seed: number): Promise<void> {
  const random = seededRandom(seed);
  const a = await startDevice('a');
  await a.assets.createCollection(COLLECTION);
  const b = await startDevice('b', synced(a.vault), syncedFolders(a.vault));
  const sync = new FakeSync(a.vault, b.vault, random);
  await settle(sync, [a, b]);
  const trial = new Trial(random);

  for (let step = 0; step < STEPS; step++) {
    for (const device of [a, b]) {
      const edits = Math.floor(random() * 3);
      for (let i = 0; i < edits; i++) await trial.edit(device);
    }
    // Offline now and then: edits pile up on both sides before they meet. Some exchanges deliver in halves.
    if (random() < 0.5) {
      const between = random() < 0.3 ? async (): Promise<void> => {
        await a.assets.reconcileWithVault();
        await b.assets.reconcileWithVault();
      } : undefined;
      clock += Math.floor(random() * COPY_SETTLE_MS);
      const outcome = await sync.exchange(between);
      await a.assets.reconcileWithVault(outcome.deletedOn[0]);
      await b.assets.reconcileWithVault(outcome.deletedOn[1]);
    }
  }
  await settle(sync, [a, b]);

  const onA = await library(a.assets);
  expect(await library(b.assets), `seed ${seed}: both devices hold one library`).toEqual(onA);
  const fresh = await startDevice('c', synced(a.vault), syncedFolders(a.vault));
  expect(await library(fresh.assets), `seed ${seed}: the index is what the files say`).toEqual(onA);
  const kept = Object.keys(onA.assets as Record<string, unknown>);
  for (const id of trial.created) {
    if (!trial.deleted.has(id)) expect(kept, `seed ${seed}: ${id} was never deleted`).toContain(id);
  }
  for (const device of [a, b, fresh]) device.assets.cancelScheduledChecks();
}

describe('two devices sharing a library through a file sync', () => {
  it.each(Array.from({ length: TRIALS }, (_, index) => index + 1))('converge without losing records (seed %i)', async (seed) => {
    await runTrial(seed);
  });
});
