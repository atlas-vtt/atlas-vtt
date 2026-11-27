// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INITIATIVE_RULES } from '../../../../src/app/gameSystems/initiativeRules';
import { cardInstanceNumber } from '../../../../src/app/initiative/cardInstanceNumber';
import { LIST_MS } from '../../../../src/app/online/gmScreen/statblocks/StatblocksScreen.ts';
import type { FightCombatant, GmScreenMessage, StatblocksFight } from '../../../../src/app/online/protocol/index.ts';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { TokenEntity } from '../../../../src/app/types';
import type { InitiativeEntry, InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { STATBLOCK_SCENARIOS } from '../../../fixtures/gmScreenStatblockNotes';
import { deviceId, type Device } from './sessionRig.ts';
import { allowed, heardBy, statblocksSession, type StatblocksSession } from './statblocksSession.ts';
import { TestScene, tokensOf } from './statblocksRig.ts';

const PHONE = deviceId('p');
const native = STATBLOCK_SCENARIOS.find((scenario) => scenario.id === 'native')!;
const auto = STATBLOCK_SCENARIOS.find((scenario) => scenario.id === 'auto')!;
const ART = readFileSync(path.resolve(__dirname, '../../../fixtures/images/rgb8.png'));

let session: StatblocksSession | null = null;

afterEach(() => {
  session?.screen.dispose();
  if (session) TemplateLibrary.release(session.harness.app);
  session?.harness.dispose();
  session = null;
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

/** Two look-alike hags and a lurker. */
function marsh(): Record<string, TokenEntity> {
  const tokens = { ...tokensOf(native), ...tokensOf(auto) };
  return {
    ...tokens,
    'hag-1': { ...tokens['hag-1']!, instanceNumber: 1 } as TokenEntity,
    'hag-2': { ...tokens['hag-1']!, id: 'hag-2', instanceNumber: 2, x: 300 } as TokenEntity,
  };
}

const entry = (tokenId: string, order: number, holder: string): InitiativeEntry =>
  ({ id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 20 - order, initiativeModifier: 0, order, isActive: tokenId === holder, imagePath: tokenId.startsWith('hag') ? native.tokens[0]!.imagePath : undefined }) as InitiativeEntry;
const fightAt = (holder: string, changes: Partial<InitiativeState> = {}): InitiativeState =>
  ({ entries: ['hag-1', 'hag-2', 'lurker-1'].map((id, order) => entry(id, order, holder)), currentIndex: 0, round: 1, isActive: true, ...changes });

const lists = (device: Device): Extract<GmScreenMessage, { t: 'statblocks' }>[] =>
  device.heard.filter((message): message is Extract<GmScreenMessage, { t: 'statblocks' }> => message.t === 'statblocks');
const rows = (fight: StatblocksFight | undefined): FightCombatant[] => fight?.parts.flatMap((part) => (part.k === 'group' ? part.combatants : [])) ?? [];
const names = (fight: StatblocksFight | undefined): string[] =>
  fight?.parts.map((part) => (part.k === 'round' ? `round ${part.round}` : `${part.key}: ${part.combatants.map((each) => `${each.name}${each.badge ? ` ${each.badge}` : ''}${each.turn ? '*' : ''}`).join(', ')}`)) ?? [];

/** Lets the list be read again after a change, and hands on whatever it sent. */
async function quiet(started: StatblocksSession): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, LIST_MS * 3));
  await started.rig.settle();
}

/** Makes a change, and expects exactly one list to reach the device for it. */
async function changeSendsOnce(started: StatblocksSession, device: Device, change: () => void): Promise<Extract<GmScreenMessage, { t: 'statblocks' }>> {
  const before = lists(device).length;
  change();
  await vi.waitFor(async () => {
    await started.rig.settle();
    expect(lists(device).length).toBeGreaterThan(before);
  }, { timeout: 5000, interval: 50 });
  await quiet(started);
  expect(lists(device)).toHaveLength(before + 1);
  return lists(device).at(-1)!;
}

describe('a fight on the Statblocks screen of a device, through its encrypted channel', { timeout: 20_000 }, () => {
  it('is sent as the tracker shows it when it starts, again once for each change, and not for a token moved', async () => {
    const scene = new TestScene('view-1', marsh());
    session = await statblocksSession([native, auto], scene, ART.buffer.slice(ART.byteOffset, ART.byteOffset + ART.byteLength));
    const phone = await allowed(session.rig, PHONE);
    const first = await heardBy(session.rig, phone, 'statblocks', (list) => list.entries.length === 2);
    expect(first.fight).toBeUndefined();
    const hag = first.entries.find((each) => each.name === 'Marsh Hag')!;

    const started = await changeSendsOnce(session, phone, () => scene.set({ initiative: fightAt('hag-1') }));
    expect(names(started.fight)).toEqual(['order: Marsh Hag 1*, Marsh Hag 2, Bog Lurker']);
    const [hag1, hag2, lurker] = rows(started.fight);
    // The GM's numbers, as the tracker's cards show them
    expect([hag1!.badge, hag2!.badge, lurker!.badge]).toEqual(['hag-1', 'hag-2', 'lurker-1'].map((id) => cardInstanceNumber(scene.state().objects.tokens, id, true) ?? undefined));
    expect(hag1).toMatchObject({ statblock: hag.id, portrait: hag.portrait, ring: '#3a7d44' });
    expect(lurker).toMatchObject({ statblock: first.entries.find((each) => each.name === 'Bog Lurker')!.id, portrait: null });

    // A token dragged across the map changes nothing the list shows: nothing is sent.
    const count = lists(phone).length;
    scene.setTokens({ ...scene.state().objects.tokens, 'hag-2': { ...scene.state().objects.tokens['hag-2']!, x: 900, y: 420 } });
    await quiet(session);
    expect(lists(phone)).toHaveLength(count);

    const moved = await changeSendsOnce(session, phone, () => scene.set({ initiative: fightAt('hag-2') }));
    expect(names(moved.fight)).toEqual(['order: Marsh Hag 2*, Bog Lurker', 'round 2', 'next: Marsh Hag 1']);

    const tokens = scene.state().objects.tokens;
    const hidden = await changeSendsOnce(session, phone, () => scene.setTokens({ ...tokens, 'lurker-1': { ...tokens['lurker-1']!, isHidden: true } as TokenEntity }));
    expect(rows(hidden.fight).find((each) => each.name === 'Bog Lurker')).toMatchObject({ hidden: true });

    const fallen = scene.state().objects.tokens;
    const defeated = await changeSendsOnce(session, phone, () => scene.setTokens({ ...fallen, 'hag-1': { ...fallen['hag-1']!, resources: { hp: { current: 0, max: 82 } } } as TokenEntity }));
    expect(rows(defeated.fight).find((each) => each.badge === 1)).toMatchObject({ defeated: true });

    const ended = await changeSendsOnce(session, phone, () => scene.set({ initiative: { ...fightAt('hag-2'), isActive: false } }));
    expect(ended.fight).toBeUndefined();
    // Nothing of the fight went to the relay in the clear.
    expect(JSON.stringify(session.rig.socket().frames())).not.toMatch(/Marsh Hag|Bog Lurker|3a7d44/);
  });

  it('groups a fight by sides under each side, the side with the turn marked', async () => {
    const tokens = marsh();
    const scene = new TestScene('view-1', { ...tokens, 'lurker-1': { ...tokens['lurker-1']!, side: 'players' } as TokenEntity });
    scene.initiativeRules = { ...DEFAULT_INITIATIVE_RULES, mode: 'sides' };
    session = await statblocksSession([native, auto], scene, ART.buffer.slice(ART.byteOffset, ART.byteOffset + ART.byteLength));
    const phone = await allowed(session.rig, PHONE);
    await heardBy(session.rig, phone, 'statblocks', (list) => list.entries.length === 2);

    const sides = await changeSendsOnce(session, phone, () => scene.set({ initiative: fightAt('', { sides: { first: 'players', active: 'opponents' } }) }));
    expect(names(sides.fight)).toEqual(['opponents: Marsh Hag 1*, Marsh Hag 2*', 'round 2', 'players: Bog Lurker']);
    expect(sides.fight!.parts[0]).toMatchObject({ side: { id: 'opponents', turn: true } });
    expect(sides.fight!.parts[2]).toMatchObject({ side: { id: 'players', turn: false } });
    expect(rows(sides.fight).find((each) => each.name === 'Bog Lurker')).toMatchObject({ ally: true });
  });

  it('leaves the list standing where the fight cannot be read, and gives a new fight keys of its own', async () => {
    const scene = new TestScene('view-1', marsh());
    session = await statblocksSession([native, auto], scene, ART.buffer.slice(ART.byteOffset, ART.byteOffset + ART.byteLength));
    const phone = await allowed(session.rig, PHONE);
    await heardBy(session.rig, phone, 'statblocks', (list) => list.entries.length === 2);
    const failed = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rules = scene.rules;
    scene.rules = () => {
      throw new Error('a collection whose rules do not read');
    };
    scene.set({ initiative: fightAt('hag-1') });
    await quiet(session);
    // The marsh's statblocks still reach the device, without the fight
    expect(lists(phone).at(-1)).toMatchObject({ map: true, entries: [{ name: 'Marsh Hag' }, { name: 'Bog Lurker' }] });
    expect(lists(phone).at(-1)!.fight).toBeUndefined();
    expect(failed).toHaveBeenCalled();
    failed.mockRestore();

    scene.rules = rules;
    const first = await changeSendsOnce(session, phone, () => scene.set({ initiative: fightAt('hag-2') }));
    await changeSendsOnce(session, phone, () => scene.set({ initiative: { ...fightAt('hag-2'), isActive: false } }));
    const second = await changeSendsOnce(session, phone, () => scene.set({ initiative: fightAt('hag-1') }));
    const firstKeys = rows(first.fight).map((row) => row.key);
    expect(firstKeys).toHaveLength(3);
    expect(rows(second.fight).map((row) => row.key).filter((key) => firstKeys.includes(key))).toEqual([]);
  });
});
