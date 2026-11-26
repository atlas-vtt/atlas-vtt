// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gmScreenMoods, keysStateOf, moodsMessage } from '../../../../src/app/online/gmScreen/keys/keysMessages.ts';
import { MAX_GM_SCREEN_MESSAGE, parseKeysMessage } from '../../../../src/app/online/protocol/index.ts';
import type { Mood } from '../../../../src/app/sound/soundTypes';
import { remoteState } from '../../../../src/app/soundRemote/remoteState';
import { PIN_ICON_PATHS } from '../../../../src/app/types/pinIcons';
import { MOOD_CREST_PATHS } from '../../../../src/app/types/moodCrestPaths';
import { fakeRemoteDirector, fakeTable, remoteMood, withMusic } from '../../../helpers/soundRemoteRig';
import { allowedDevice, heardOf, keysRig, settleUntil, soundWorld } from './keysRig.ts';
import { deviceId, RelaySocket, type Frame } from './sessionRig.ts';

const PHONE = deviceId('p');

beforeEach(() => {
  RelaySocket.all = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const longName = (index: number): string => `${index} ${'Haunted moor at midnight '.repeat(12)}`;
const moods = (count: number): Mood[] => Array.from({ length: count }, (_, index) => remoteMood(`mood-${index}`, longName(index)));

/** How many UTF-8 bytes a message is as the channel seals it. */
const bytes = (message: unknown): number => new TextEncoder().encode(JSON.stringify(message)).length;

describe('the moods a device\'s keys draw', () => {
  it('carry each crest by an id the device reads, whichever crest a mood has', () => {
    const crests = [...Object.keys(MOOD_CREST_PATHS), ...Object.keys(PIN_ICON_PATHS)];
    const all = crests.map((crest, index) => ({ ...remoteMood(`m${index}`), icon: crest as Mood['icon'] }));
    const message = { t: 'moods', moods: gmScreenMoods(all) };
    expect(parseKeysMessage(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });

  it('fit the device\'s limits: a name cut short, an id too long to press left out', () => {
    const odd = [remoteMood('ok', 'x'.repeat(500)), remoteMood('i'.repeat(201))];
    const listed = gmScreenMoods(odd);
    expect(listed.map((mood) => [mood.id, mood.name.length])).toEqual([['ok', 200]]);
    expect(parseKeysMessage({ t: 'moods', moods: listed })).not.toBeNull();
  });

  it('send 200 moods with long names whole in one frame, without their artwork', async () => {
    const world = soundWorld();
    world.setMoods(moods(200));
    const rig = await keysRig(world);
    const phone = await allowedDevice(rig, PHONE);
    expect(heardOf(phone, 'moods')[0]?.moods).toHaveLength(200);
    const message = heardOf(phone, 'moods')[0];
    expect(bytes(message)).toBeLessThan(80 * 1024);
    // One sealed message in one relay entry: nothing was sent in parts.
    const entries = rig.socket().frames().flatMap((frame) => (frame.t === 'sends' ? (frame.sends as Frame[]) : [frame]));
    expect(entries.filter((entry) => (entry.body as Frame | undefined)?.t === 'part')).toEqual([]);
    // As many as the device may hold, at the longest names, still fit one message.
    expect(bytes({ t: 'moods', moods: gmScreenMoods(moods(1000)) })).toBeLessThan(MAX_GM_SCREEN_MESSAGE);
  });

  it('send a renamed mood alone, a new one at the end, a removed one by id, and a new order whole', async () => {
    const world = soundWorld();
    world.setMoods(moods(300));
    const rig = await keysRig(world);
    const phone = await allowedDevice(rig, PHONE);
    phone.heard.length = 0;
    const renamed = world.moods.map((mood, index) => (index === 42 ? { ...mood, name: 'Storm' } : mood));
    world.setMoods(renamed);
    rig.tick(1000);
    await settleUntil(rig, () => phone.heard.length > 0);
    expect(phone.heard).toEqual([{ t: 'mood-changes', moods: [expect.objectContaining({ id: 'mood-42', name: 'Storm' })], removed: [] }]);
    phone.heard.length = 0;
    world.setMoods([...renamed.filter((mood) => mood.id !== 'mood-7'), remoteMood('new', 'New')]);
    rig.tick(1000);
    await settleUntil(rig, () => phone.heard.length > 0);
    expect(phone.heard).toEqual([{ t: 'mood-changes', moods: [expect.objectContaining({ id: 'new' })], removed: ['mood-7'] }]);
    phone.heard.length = 0;
    world.setMoods([...world.moods].reverse());
    rig.tick(1000);
    await settleUntil(rig, () => phone.heard.length > 0);
    expect(phone.heard.map((message) => message.t)).toEqual(['moods']);
  });

  it('go as one change when the list is rebuilt in a burst', async () => {
    const world = soundWorld();
    const rig = await keysRig(world);
    const phone = await allowedDevice(rig, PHONE);
    phone.heard.length = 0;
    for (let count = 3; count <= 40; count += 1) {
      world.setMoods(moods(count));
      rig.tick(5);
    }
    rig.tick(1000);
    await settleUntil(rig, () => heardOf(phone, 'mood-changes').reduce((sum, message) => sum + message.moods.length, 0) >= 40);
    expect(heardOf(phone, 'mood-changes').length).toBeLessThanOrEqual(2);
  });

  it('change nothing a device holds where only what keys do not draw changed', () => {
    const before = gmScreenMoods(moods(5));
    const after = gmScreenMoods(moods(5).map((mood) => ({ ...mood, fadeSeconds: 9, order: 3 })));
    expect(moodsMessage(before, after)).toBeNull();
  });
});

describe('the state a device\'s keys show', () => {
  it('reads on the device even where a text is longer than it reads', () => {
    const director = fakeRemoteDirector(withMusic());
    director.shelf = { recordOfKey: () => ({ name: 'A very long track name '.repeat(30) }) } as never;
    const table = fakeTable();
    table.map.savedRolls = () => [{ id: 'r', name: 'Roll '.repeat(80), formula: '1d20+'.repeat(60) }];
    const state = keysStateOf(remoteState(director, () => null, table.table), false);
    expect(state.music?.track?.length).toBe(200);
    expect(parseKeysMessage(JSON.parse(JSON.stringify({ t: 'keys', state })))).toEqual({ t: 'keys', state });
  });

  it('tells a device that Atlas sends the grid of keys, where a state without the word reads as before', () => {
    const state = keysStateOf(remoteState(fakeRemoteDirector(withMusic()), () => null, fakeTable().table), false);
    expect(parseKeysMessage(JSON.parse(JSON.stringify({ t: 'keys', state })))).toMatchObject({ state: { grid: true } });
    const { grid: _grid, ...older } = state;
    const parsed = parseKeysMessage(JSON.parse(JSON.stringify({ t: 'keys', state: older })));
    expect(parsed?.t === 'keys' && 'grid' in parsed.state).toBe(false);
  });
});
