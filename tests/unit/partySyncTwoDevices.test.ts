// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { partyKey, readPartyKey, type PartyValues } from '../../src/app/campaigns/partyValues/partyKeys';
import { partyValuesOf } from '../../src/app/campaigns/partyValues/charactersFile';
import { getHistoryStore } from '../../src/app/stores/history';
import type { ViewAtlasStore } from '../../src/app/storeFactory';
import { FakeSync, seededRandom } from './library/fakeSync';
import { CAMPAIGN, CHARACTERS_PATH, fileChanged, partyDevice, placed, settle, type PartyDevice } from '../helpers/partyDevice';

/**
 * Two devices play one campaign while a file sync carries its characters file between them,
 * sometimes after long offline stretches; when both changed the file, one side's version wins,
 * as sync tools do. Whatever happens, once the sync has settled both devices hold the values the
 * file holds, in their stores and on their characters' tokens.
 */

const TRIALS = Number(import.meta.env.VITE_PARTY_SYNC_TRIALS ?? 8);
const STEPS = 25;
const CHARACTERS = ['pc-ayla', 'pc-bram'];

const devices: PartyDevice[] = [];
afterEach(() => {
  for (const device of devices.splice(0)) device.release();
});

async function start(files?: Record<string, string>): Promise<{ device: PartyDevice; store: ViewAtlasStore }> {
  const device = partyDevice(files);
  devices.push(device);
  await device.ready;
  const store = device.openView();
  store.getState().addTokens(CHARACTERS.map((character, i) => placed(character, 20, i * 70)));
  getHistoryStore(store)!.getState().clear();
  return { device, store };
}

const campaignValues = (values: PartyValues): PartyValues =>
  Object.fromEntries(Object.entries(values).filter(([key]) => readPartyKey(key)?.campaignId === CAMPAIGN).sort(([a], [b]) => a.localeCompare(b)));

const fileValues = (device: PartyDevice): PartyValues => {
  const text = device.vault.files.get(CHARACTERS_PATH);
  if (text === undefined) return {};
  const stored = JSON.parse(text) as Record<string, unknown>;
  return campaignValues(partyValuesOf({ ...stored, id: CAMPAIGN }));
};

/** What each token of a character shows, by party key. */
function tokenValues(store: ViewAtlasStore): Record<string, number | undefined> {
  return Object.fromEntries(Object.values(store.getState().objects.tokens).map((token) => [token.assetId, token.resources?.hp?.current]));
}

/** Exchanges the files and tells each vault what arrived, as its events would. */
async function exchange(sync: FakeSync, sides: readonly PartyDevice[]): Promise<boolean> {
  const before = sides.map((side) => side.vault.files.get(CHARACTERS_PATH));
  const { changed } = await sync.exchange();
  sides.forEach((side, i) => {
    if (side.vault.files.get(CHARACTERS_PATH) !== before[i]) fileChanged(side, CHARACTERS_PATH);
  });
  await settle();
  return changed;
}

async function runTrial(seed: number): Promise<void> {
  const random = seededRandom(seed);
  const a = await start();
  const b = await start(Object.fromEntries(a.device.vault.files));
  const sync = new FakeSync(a.device.vault, b.device.vault, random);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

  for (let step = 0; step < STEPS; step++) {
    for (const { device, store } of [a, b]) {
      const edits = Math.floor(random() * 3);
      for (let i = 0; i < edits; i++) {
        const roll = random();
        const hp = Math.floor(random() * 21);
        if (roll < 0.55) {
          const id = pick(Object.keys(store.getState().objects.tokens));
          device.setHp(store, id, hp);
        } else if (roll < 0.8) {
          device.sync.setValue(CAMPAIGN, pick(CHARACTERS), 'hp', { current: hp, max: 20 });
        } else {
          getHistoryStore(store)!.getState()[random() < 0.7 ? 'undo' : 'redo']();
        }
      }
      if (random() < 0.5) await device.sync.flush();
    }
    // Offline now and then: changes pile up on both sides before they meet.
    if (random() < 0.5) await exchange(sync, [a.device, b.device]);
  }

  for (let round = 0; ; round++) {
    if (round === 8) throw new Error(`seed ${seed}: the two devices kept changing the file`);
    await a.device.sync.flush();
    await b.device.sync.flush();
    if (!(await exchange(sync, [a.device, b.device]))) break;
  }

  const onFile = fileValues(a.device);
  expect(fileValues(b.device), `seed ${seed}: both files are one`).toEqual(onFile);
  for (const { store } of [a, b]) {
    expect(campaignValues(store.getState().partyValues), `seed ${seed}: the store holds the file's values`).toEqual(onFile);
    const shown = tokenValues(store);
    for (const character of CHARACTERS) {
      const value = onFile[partyKey(CAMPAIGN, character, 'hp')];
      expect(shown[character], `seed ${seed}: ${character}'s token shows the file's value`).toBe(value?.current);
    }
  }
}

describe('two devices playing one campaign through a file sync', () => {
  it.each(Array.from({ length: TRIALS }, (_, index) => index + 1))('agree on the characters\' values (seed %i)', async (seed) => {
    await runTrial(seed);
  });
});
