// @vitest-environment jsdom
import { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_SAVE_QUIET_MS } from '../../../../src/app/online/gmScreen/keys/settingsLayouts.ts';
import {
  GRID_SLOTS, layoutKeyCount, MAX_FOLDER_DEPTH, MAX_LAYOUT_KEYS, MAX_SHOWN_FOREIGN_KEY,
  type GmScreenDevice, type GmScreenLayout, type LayoutSlot,
} from '../../../../src/app/online/protocol/index.ts';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { memoryPluginData } from '../../../mocks/pluginData';
import { joinedDevice, lastLayout, layoutHeard, layoutRig } from './layoutRig.ts';
import { deviceId, RelaySocket } from './sessionRig.ts';

const PHONE = deviceId('p');

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Why `layout` is no legal grid for `device`; null where it is one, or where there is none. */
function illegal(layout: GmScreenLayout | undefined, device: GmScreenDevice): string | null {
  if (layout === undefined) return null;
  const walk = (slots: readonly LayoutSlot[], depth: number): string | null => {
    if (slots.length !== GRID_SLOTS[device] - (depth > 0 ? 1 : 0)) return `${slots.length} slots ${depth} deep`;
    for (const slot of slots) {
      if (slot?.k !== 'folder' || !('slots' in slot)) continue;
      const inner = depth >= MAX_FOLDER_DEPTH ? 'too deep' : walk(slot.slots, depth + 1);
      if (inner !== null) return inner;
    }
    return null;
  };
  return walk(layout.slots, 0) ?? (layoutKeyCount(layout.slots) > MAX_LAYOUT_KEYS ? 'too many keys' : null);
}

const deeply = (inside: unknown, depth: number): unknown => {
  let value = inside;
  for (let level = 0; level < depth; level += 1) value = [value];
  return value;
};

describe('grids in a settings file this version did not write', () => {
  it('keeps a key of a newer kind through a save whatever it holds within its limit, and shows a device a large one as its kind alone', async () => {
    const big = { k: 'macro', steps: Array.from({ length: 60 }, (_, step) => ({ do: 'mood', id: `mood-${step}` })) };
    const small = { k: 'timer', seconds: 60 };
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_SHOWN_FOREIGN_KEY);
    const rig = await layoutRig(memoryPluginData({ gmScreenKeys: { phone: { slots: [big, small] } } }));
    const phone = await joinedDevice(rig, PHONE);
    expect((await rig.ask(phone, 'phone'))?.slots.slice(0, 2)).toEqual([{ k: 'macro' }, small]);
    expect(await rig.edit(phone, 1, { op: 'move', from: [0], to: [5] })).toBeNull();
    expect(await rig.edit(phone, 2, { op: 'put', at: [14], key: { k: 'moods' } })).toBeNull();
    rig.timers.advance(LAYOUT_SAVE_QUIET_MS);
    await rig.settings.saveSettingsNow();
    const saved = (rig.data.stored() as { gmScreenKeys: { phone: { slots: unknown[] } } }).gmScreenKeys.phone.slots;
    expect(saved[5]).toEqual(big);
    expect(saved[1]).toEqual(small);
  });

  const hostile: Array<[string, unknown]> = [
    ['a string', 'x'], ['a list', []], ['a phone of null', { phone: null }], ['slots of text', { phone: { slots: 'x' } }],
    ['slots of junk', { phone: { slots: [1, 'a', null, [], {}, { k: 5 }, { k: 'folder' }, { k: 'folder', name: 'a', glyph: 'x', slots: 'no' }, { k: 'mood', id: 5, name: 5 }] } }],
    ['a hundred thousand slots', { phone: { slots: Array.from({ length: 100_000 }, () => ({ k: 'moods' })) } }],
    ['folders wide and deep', { tablet: { slots: Array.from({ length: 30 }, function deep(_: unknown, __: number, ___?: unknown, depth = 0): unknown {
      return depth > 6 ? { k: 'moods' } : { k: 'folder', name: 'n', glyph: 'star', slots: Array.from({ length: depth < 2 ? 30 : 2 }, (a, b) => deep(a, b, null, depth + 1)) };
    }) } }],
    ['a newer key past its limit', { phone: { slots: [{ k: 'timer', text: 'x'.repeat(20_000) }] } }],
    ['prototype keys', JSON.parse('{"phone":{"slots":[{"k":"timer","__proto__":{"k":"folder"}}],"__proto__":{"slots":[]}},"__proto__":{"phone":1}}')],
  ];
  it.each(hostile)('reads %s into a legal grid or the default, and takes a change', async (_name, stored) => {
    const rig = await layoutRig(memoryPluginData({ gmScreenKeys: stored }));
    const keys = rig.settings.get('gmScreenKeys');
    expect(illegal(keys.phone, 'phone')).toBeNull();
    expect(illegal(keys.tablet, 'tablet')).toBeNull();
    const phone = await joinedDevice(rig, PHONE);
    expect(illegal(await rig.ask(phone, 'phone'), 'phone')).toBeNull();
    expect(await rig.edit(phone, 1, { op: 'put', at: [14], key: { k: 'moods' } })).toBeNull();
  });

  it.each([
    ['a grid', { gmScreenKeys: { phone: deeply(1, 200_000) } }],
    ['a newer key', { gmScreenKeys: { phone: { slots: [{ k: 'timer', deep: deeply(1, 200_000) }] } } }],
  ])('loads the settings with %s nested too deep to write, leaving it out', async (_name, stored) => {
    const settings = new SettingsService(new App(), undefined, { loadData: () => Promise.resolve(stored), saveData: () => Promise.resolve() });
    await settings.initialize();
    expect(settings.get('gmScreenKeys').phone?.slots[0] ?? null).toBeNull();
  });

  it.each([['€', 975], ['x', 975], ['\u0001', 160], ['"', 480]])('sends a full grid of newer keys of %j x %i to a device whole, in parts', async (char, count) => {
    const newer = (): unknown => ({ k: 'timer', t: char.repeat(count) });
    const folder = (slots: unknown[]): unknown => ({ k: 'folder', name: 'n', glyph: 'star', slots });
    const slots = Array.from({ length: GRID_SLOTS.phone }, () => folder(Array.from({ length: GRID_SLOTS.phone - 1 }, () => folder(Array.from({ length: GRID_SLOTS.phone - 1 }, newer)))));
    const rig = await layoutRig(memoryPluginData({ gmScreenKeys: { phone: { slots } } }));
    const stored = rig.settings.get('gmScreenKeys').phone;
    expect(layoutKeyCount(stored?.slots ?? [])).toBe(MAX_LAYOUT_KEYS);
    const phone = await joinedDevice(rig, PHONE);
    const framesBefore = rig.socket().sent.length;
    expect(await phone.say({ t: 'layout-ask', device: 'phone' })).toBe(true);
    for (let turn = 0; turn < 20; turn += 1) await rig.settle();
    // The rig hands on whole bodies only: the page puts a message's parts together, so this does it for the page.
    const parts = rig.socket().sent.slice(framesBefore).filter((text) => text.startsWith('{')).flatMap((text) => {
      const frame = JSON.parse(text) as { t: string; sends?: Array<{ body: { t: string; data: string } }>; body?: { t: string; data: string } };
      return (frame.t === 'sends' ? (frame.sends ?? []).map((each) => each.body) : frame.body ? [frame.body] : []).filter((body) => body.t === 'part');
    });
    expect(parts.length).toBeGreaterThan(0);
    await phone.channel.receive(JSON.parse(Buffer.concat(parts.map((part) => Buffer.from(part.data, 'base64'))).toString('utf8')));
    expect(layoutHeard(phone).filter((message) => message.t === 'layout')).toHaveLength(1);
    expect(lastLayout(phone)).toEqual(JSON.parse(JSON.stringify(stored)));
  });
});
