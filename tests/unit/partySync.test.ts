// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { TFolder } from 'obsidian';
import { getHistoryStore } from '../../src/app/stores/history';
import { partyKey } from '../../src/app/campaigns/partyValues/partyKeys';
import { CAMPAIGNS_FOLDER } from '../../src/app/campaigns/campaignPaths';
import { tokenToFile } from '../../src/app/resources/resourceFileFormat';
import {
  CAMPAIGN, CAMPAIGN_FOLDER, CHARACTERS_PATH, campaignFile, fileChanged, hpKey, partyDevice, placed, settle, type PartyDevice,
} from '../helpers/partyDevice';

const devices: PartyDevice[] = [];
const device = (...args: Parameters<typeof partyDevice>): PartyDevice => {
  const opened = partyDevice(...args);
  devices.push(opened);
  return opened;
};
afterEach(() => {
  for (const opened of devices.splice(0)) opened.release();
});

const hpIn = (store: PartyDevice['stores'][number], id: string): number | undefined => store.getState().objects.tokens[id]?.resources?.hp?.current;
const onDisk = (party: PartyDevice): unknown => JSON.parse(party.vault.files.get(CHARACTERS_PATH) ?? 'null');

describe('a played campaign\'s character values', () => {
  it('are one in every view and are written to the campaign\'s characters file', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const b = party.openView();
    const [inA] = a.getState().addTokens([placed('pc-ayla', 20)]);
    const [inB] = b.getState().addTokens([placed('pc-ayla', 18, 70)]);
    // The first token's numbers are the party's; the second takes them.
    expect(hpIn(b, inB!)).toBe(20);
    party.setHp(a, inA!, 7);
    expect(hpIn(b, inB!)).toBe(7);
    // Mirrored, not edited: B has no step of its own for it.
    expect(getHistoryStore(b)!.getState().pastStates).toHaveLength(1);
    await party.sync.flush();
    expect(onDisk(party)).toEqual({ format: 1, campaignId: CAMPAIGN, characters: { 'pc-ayla': { resources: { hp: { current: 7, max: 20 } } } } });
  });

  it('are one for a character\'s forms: every player character linking its note shares them, under the first made', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const [ayla, bear] = a.getState().addTokens([placed('pc-ayla', 20), placed('pc-ayla-bear', 9, 70)]);
    expect(hpIn(a, bear!)).toBe(20);
    party.setHp(a, bear!, 6);
    expect(hpIn(a, ayla!)).toBe(6);
    await party.sync.flush();
    expect(onDisk(party)).toEqual({ format: 1, campaignId: CAMPAIGN, characters: { 'pc-ayla': { resources: { hp: { current: 6, max: 20 } } } } });
  });

  it('carry an undo in one view to the others and to the file', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const b = party.openView();
    const [inA] = a.getState().addTokens([placed('pc-ayla', 20)]);
    const [inB] = b.getState().addTokens([placed('pc-ayla', 20)]);
    party.setHp(a, inA!, 4);
    getHistoryStore(a)!.getState().undo();
    expect([hpIn(a, inA!), hpIn(b, inB!)]).toEqual([20, 20]);
    await party.sync.flush();
    expect(onDisk(party)).toMatchObject({ characters: { 'pc-ayla': { resources: { hp: { current: 20 } } } } });
  });

  it('take in a change another device made to the file', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const [inA] = a.getState().addTokens([placed('pc-ayla', 20)]);
    await party.sync.flush();
    party.vault.files.set(CHARACTERS_PATH, JSON.stringify({ format: 1, campaignId: CAMPAIGN, characters: { 'pc-ayla': { resources: { hp: { current: 3, max: 20 } } }, note: 'kept' } }));
    fileChanged(party, CHARACTERS_PATH);
    await settle();
    expect(hpIn(a, inA!)).toBe(3);
    expect(getHistoryStore(a)!.getState().pastStates).toHaveLength(1);
  });

  it('start from the values the tokens hold when a campaign starts to keep them', async () => {
    const party = device(undefined, null);
    await party.ready;
    const a = party.openView();
    const [first, second] = a.getState().addTokens([placed('pc-ayla', 13), placed('pc-ayla', 9, 70)]);
    party.setHp(a, second!, 8);
    expect([hpIn(a, first!), hpIn(a, second!)]).toEqual([13, 8]);
    party.play.play(CAMPAIGN);
    expect([hpIn(a, first!), hpIn(a, second!)]).toEqual([13, 13]);
    await party.sync.flush();
    expect(onDisk(party)).toMatchObject({ campaignId: CAMPAIGN, characters: { 'pc-ayla': { resources: { hp: { current: 13 } } } } });
  });

  it('leave each token its own values once the campaign is stopped', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const [first, second] = a.getState().addTokens([placed('pc-ayla', 20), placed('pc-ayla', 20, 70)]);
    party.setHp(a, first!, 11);
    party.play.stop();
    party.setHp(a, first!, 2);
    expect([hpIn(a, first!), hpIn(a, second!)]).toEqual([2, 11]);
    await party.sync.flush();
    expect(onDisk(party)).toMatchObject({ characters: { 'pc-ayla': { resources: { hp: { current: 11 } } } } });
  });

  it('stay off for a campaign a newer Atlas wrote', async () => {
    const party = device({ [`${CAMPAIGN_FOLDER}/campaign.json`]: campaignFile({ format: 2 }) });
    await party.ready;
    const a = party.openView();
    const [first, second] = a.getState().addTokens([placed('pc-ayla', 20), placed('pc-ayla', 20, 70)]);
    party.setHp(a, first!, 5);
    expect(hpIn(a, second!)).toBe(20);
    expect(party.sync.setValue(CAMPAIGN, 'pc-ayla', 'hp', { current: 1, max: 20 })).toBe(false);
    await party.sync.flush();
    expect(party.vault.files.has(CHARACTERS_PATH)).toBe(false);
  });

  it('leave scene files as every Atlas reads them', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const path = 'maps/keep.atlasmap';
    party.vault.app.vault.getFileByPath = party.vault.app.vault.getAbstractFileByPath as never;
    a.setState({ mapPath: path, mapLoaded: true });
    const [id] = a.getState().addTokens([placed('pc-ayla', 20)]);
    party.setHp(a, id!, 6);
    await a.flushStorage();
    const saved = [...party.vault.files.entries()].find(([file]) => file.includes('keep'))?.[1];
    const state = JSON.parse(saved!).state as Record<string, unknown> & { objects: { tokens: Record<string, unknown> } };
    expect(state).not.toHaveProperty('partyValues');
    expect(state.objects.tokens[id!]).toEqual(tokenToFile(a.getState().objects.tokens[id!]!));
    expect(state.objects.tokens[id!]).toMatchObject({ hp: { current: 6, max: 20 } });
  });

  it('set a value from outside a scene without an undo step, in every open scene that holds the character', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const [id] = a.getState().addTokens([placed('pc-ayla', 20)]);
    const steps = getHistoryStore(a)!.getState().pastStates.length;
    expect(party.sync.setValue(CAMPAIGN, 'pc-ayla', 'hp', { current: 12, max: 20 })).toBe(true);
    expect(hpIn(a, id!)).toBe(12);
    expect(party.sync.value(CAMPAIGN, 'pc-ayla', 'hp')).toEqual({ current: 12, max: 20 });
    expect(getHistoryStore(a)!.getState().pastStates).toHaveLength(steps);
    // A character with no token in any open scene keeps its value in the file alone.
    expect(party.sync.setValue(CAMPAIGN, 'pc-bram', 'hp', { current: 30, max: 30 })).toBe(true);
    await party.sync.flush();
    expect(onDisk(party)).toMatchObject({ characters: { 'pc-ayla': { resources: { hp: { current: 12 } } }, 'pc-bram': { resources: { hp: { current: 30 } } } } });
    expect(a.getState().partyValues[partyKey(CAMPAIGN, 'pc-bram', 'hp')]).toEqual({ current: 30, max: 30 });
  });

  it('write a campaign that is not played into its file alone', async () => {
    const other = `${CAMPAIGNS_FOLDER}/Moor`;
    const party = device({ [`${CAMPAIGN_FOLDER}/campaign.json`]: campaignFile(), [`${other}/campaign.json`]: JSON.stringify({ format: 1, id: 'c2', name: 'Moor', createdAt: 1 }) });
    await party.ready;
    const a = party.openView();
    a.getState().addTokens([placed('pc-ayla', 20)]);
    expect(party.sync.setValue('c2', 'pc-ayla', 'hp', { current: 1, max: 20 })).toBe(true);
    await party.sync.flush();
    expect(JSON.parse(party.vault.files.get(`${other}/characters.json`)!)).toMatchObject({ campaignId: 'c2', characters: { 'pc-ayla': { resources: { hp: { current: 1 } } } } });
    expect(a.getState().partyValues[hpKey('pc-ayla')]?.current).toBe(20);
  });

  it('follow the campaign\'s folder when it is renamed', async () => {
    const party = device();
    await party.ready;
    const a = party.openView();
    const [id] = a.getState().addTokens([placed('pc-ayla', 20)]);
    await party.sync.flush();
    const moved = `${CAMPAIGNS_FOLDER}/Witherwild Moor`;
    await party.vault.app.vault.adapter.rename(CAMPAIGN_FOLDER, moved);
    party.vault.emit('rename', new TFolder(moved), CAMPAIGN_FOLDER);
    party.setHp(a, id!, 2);
    await party.sync.flush();
    expect(party.vault.files.has(CHARACTERS_PATH)).toBe(false);
    expect(JSON.parse(party.vault.files.get(`${moved}/characters.json`)!)).toMatchObject({ characters: { 'pc-ayla': { resources: { hp: { current: 2 } } } } });
  });
});
