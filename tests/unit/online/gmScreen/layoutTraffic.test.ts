// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAYOUT_GAP_MS } from '../../../../src/app/online/gmScreen/keys/LayoutScreen.ts';
import { GRID_SLOTS } from '../../../../src/app/online/protocol/index.ts';
import { memoryPluginData } from '../../../mocks/pluginData';
import { settleUntil } from './keysRig.ts';
import { joinedDevice, lastLayout, layoutHeard, layoutRig } from './layoutRig.ts';
import { deviceId, RelaySocket, type Device } from './sessionRig.ts';

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const layoutsOf = (device: Device): number => layoutHeard(device).filter((message) => message.t === 'layout').length;
const answersOf = (device: Device): number[] => layoutHeard(device).flatMap((message) => (message.t === 'layout-answer' ? [message.id] : []));

/** A phone's grid as full as a device can make it: every slot a folder of the longest dice keys. */
function fullGrid(): unknown {
  const dice = { k: 'dice', formula: `1d20 adv${' '.repeat(192)}` };
  const folder = { k: 'folder', name: 'F'.repeat(40), glyph: 'skull', slots: Array.from({ length: GRID_SLOTS.phone - 1 }, () => dice) };
  return { slots: [...Array.from({ length: GRID_SLOTS.phone - 1 }, () => folder), null] };
}

describe('what changes to the grid cost', () => {
  it('sends a burst of changes from one phone to three phones as a few grids, each change answered once and before the grid that holds it', async () => {
    const rig = await layoutRig(memoryPluginData({ gmScreenKeys: { phone: fullGrid() } }));
    const phones = [await joinedDevice(rig, deviceId('p')), await joinedDevice(rig, deviceId('q')), await joinedDevice(rig, deviceId('r'))];
    for (const phone of phones) await rig.ask(phone, 'phone');
    const [editor] = phones as [Device, ...Device[]];
    const before = { layouts: phones.map(layoutsOf), frames: rig.socket().sent.length, at: rig.timers.now() };
    const CHANGES = 60;
    for (let id = 1; id <= CHANGES; id += 1) {
      expect(await editor.say({ t: 'layout-edit', id, edit: { op: 'put', at: [GRID_SLOTS.phone - 1], key: { k: 'dice', formula: `${id}d6` } } })).toBe(true);
      // Three changes a send window: sixty in a few seconds.
      if (id % 3 === 0) await rig.settle(1);
    }
    await settleUntil(rig, () => answersOf(editor).length === CHANGES);
    await rig.settle();
    const took = rig.timers.now() - before.at;
    const frames = rig.socket().sent.slice(before.frames);
    const grids = phones.map((phone, index) => layoutsOf(phone) - (before.layouts[index] ?? 0));
    console.log(`${CHANGES} changes in ${took} ms: grids per phone ${grids.join('/')}, ${frames.length} frames of ${frames.reduce((sum, text) => sum + text.length, 0)} characters from Atlas`);

    expect(answersOf(editor)).toEqual(Array.from({ length: CHANGES }, (_, index) => index + 1));
    for (const grid of grids) expect(grid).toBeLessThanOrEqual(Math.min(Math.ceil(took / LAYOUT_GAP_MS) + 1, CHANGES / 4));
    const stored = JSON.parse(JSON.stringify(rig.store.layout('phone'))) as unknown;
    for (const phone of phones) expect(lastLayout(phone)).toEqual(stored);
    // Each grid the editor heard holds only changes already answered.
    let answered = 0;
    for (const message of layoutHeard(editor)) {
      if (message.t === 'layout-answer') answered = message.id;
      const slot = message.t === 'layout' ? message.layout.slots[GRID_SLOTS.phone - 1] : null;
      if (slot?.k === 'dice') expect(Number.parseInt(slot.formula, 10)).toBeLessThanOrEqual(answered);
    }
  });
});
