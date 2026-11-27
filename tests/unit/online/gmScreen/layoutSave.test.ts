// @vitest-environment jsdom
import { App } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plugLayoutScreen } from '../../../../src/app/online/gmScreen/keys/atlasLayout.ts';
import { defaultLayout } from '../../../../src/app/online/gmScreen/keys/defaultLayouts.ts';
import { LAYOUT_SAVE_MAX_MS, LAYOUT_SAVE_QUIET_MS } from '../../../../src/app/online/gmScreen/keys/settingsLayouts.ts';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { memoryPluginData } from '../../../mocks/pluginData';
import { settleUntil } from './keysRig.ts';
import { joinedDevice, lastLayout, layoutHeard, layoutRig } from './layoutRig.ts';
import { deviceId, RelaySocket, sessionRig } from './sessionRig.ts';

const PHONE = deviceId('p');
const SECOND = deviceId('q');

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Stored = { gmScreenKeys?: { phone?: { slots: unknown[] } } } | null;
const storedPhone = (data: ReturnType<typeof memoryPluginData>): unknown => (data.stored() as Stored)?.gmScreenKeys?.phone;
const toggle = (turn: number): Record<string, unknown> => (turn % 2 === 0 ? { op: 'put', at: [14], key: { k: 'moods' } } : { op: 'remove', at: [14] });

describe("the grid's changes in the settings file", () => {
  it('reach the settings a few times while keys are arranged, never later than the longest wait, and the last state on a pause', async () => {
    const rig = await layoutRig();
    const writes = vi.spyOn(rig.settings, 'setGmScreenKeys');
    const phone = await joinedDevice(rig, PHONE);
    await rig.ask(phone, 'phone');
    const start = rig.timers.now();
    let unsavedSince: number | null = null;
    let longestUnsaved = 0;
    for (let turn = 0; turn < 30; turn += 1) {
      expect(await rig.edit(phone, turn + 1, toggle(turn))).toBeNull();
      const held = JSON.stringify(rig.store.layout('phone'));
      const saved = JSON.stringify(rig.settings.getGmScreenKeys().phone ?? defaultLayout('phone'));
      unsavedSince = held === saved ? null : (unsavedSince ?? rig.timers.now());
      if (unsavedSince !== null) longestUnsaved = Math.max(longestUnsaved, rig.timers.now() - unsavedSince);
      rig.timers.advance(300);
    }
    const took = rig.timers.now() - start;
    expect(writes.mock.calls.length).toBeLessThanOrEqual(Math.ceil(took / LAYOUT_SAVE_MAX_MS));
    expect(longestUnsaved).toBeLessThanOrEqual(LAYOUT_SAVE_MAX_MS);
    rig.timers.advance(LAYOUT_SAVE_QUIET_MS);
    expect(rig.settings.getGmScreenKeys().phone ?? defaultLayout('phone')).toEqual(rig.store.layout('phone'));
    await rig.settings.saveSettingsNow();
    expect(storedPhone(rig.data) ?? defaultLayout('phone')).toEqual(JSON.parse(JSON.stringify(lastLayout(phone))));
  });

  it('reach the settings when the last device leaves, as when the GM stops the room', async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    await rig.ask(phone, 'phone');
    expect(await rig.edit(phone, 1, { op: 'remove', at: [0] })).toBeNull();
    expect(rig.settings.getGmScreenKeys().phone).toBeUndefined();
    rig.socket().receive({ t: 'player-left', id: PHONE });
    await rig.settle();
    expect(rig.settings.getGmScreenKeys().phone?.slots[0]).toBeNull();
  });

  it('are written to the file at once when Atlas unloads', async () => {
    const rig = sessionRig();
    const data = memoryPluginData();
    const app = new App();
    await new SettingsService(app, undefined, data).initialize();
    const unplug = plugLayoutScreen(app, rig.session, rig.timers);
    await rig.session.start();
    rig.socket().welcome();
    await rig.settle();
    const phone = await joinedDevice(rig, PHONE);
    expect(await phone.say({ t: 'layout-ask', device: 'phone' })).toBe(true);
    await settleUntil(rig, () => lastLayout(phone) !== undefined);
    expect(await phone.say({ t: 'layout-edit', id: 1, edit: { op: 'remove', at: [0] } })).toBe(true);
    await settleUntil(rig, () => layoutHeard(phone).some((message) => message.t === 'layout-answer'));
    expect(storedPhone(data)).toBeUndefined();
    unplug();
    await settleUntil(rig, () => storedPhone(data) !== undefined);
    expect((storedPhone(data) as { slots: unknown[] }).slots[0]).toBeNull();
  });
});

describe('the grid beside the settings', () => {
  it('leaves one grid, shown by the others, when a device leaves between its change and the answer', async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    const second = await joinedDevice(rig, SECOND);
    await rig.ask(phone, 'phone');
    await rig.ask(second, 'phone');
    await phone.say({ t: 'layout-edit', id: 1, edit: { op: 'put', at: [14], key: { k: 'moods' } } });
    await second.say({ t: 'layout-edit', id: 1, edit: { op: 'put', at: [13], key: { k: 'dice', formula: '1d4' } } });
    rig.timers.advance(1000);
    rig.socket().receive({ t: 'player-left', id: PHONE });
    await rig.settle();
    const held = rig.store.layout('phone');
    expect(held.slots[13]).toEqual({ k: 'dice', formula: '1d4' });
    expect(lastLayout(second)).toEqual(held);
    expect(layoutHeard(second).filter((message) => message.t === 'layout-answer')).toHaveLength(1);
  });

  it('ends in one grid on every phone when a change arrives while a synced settings file is being read, and the change is kept', async () => {
    const data = memoryPluginData();
    let gate: (() => void) | null = null;
    let slow = false;
    const store = {
      ...data,
      loadData: async (): Promise<unknown> => {
        if (slow) await new Promise<void>((resolve) => { gate = resolve; });
        return data.loadData();
      },
    };
    const rig = await layoutRig(store);
    const phone = await joinedDevice(rig, PHONE);
    const second = await joinedDevice(rig, SECOND);
    await rig.ask(phone, 'phone');
    await rig.ask(second, 'phone');
    data.set({ gmScreenKeys: { phone: { slots: [{ k: 'moods' }, ...defaultLayout('phone').slots.slice(1)] } } });
    slow = true;
    const reloading = rig.settings.reload();
    await settleUntil(rig, () => gate !== null);
    expect(await rig.edit(phone, 1, { op: 'put', at: [14], key: { k: 'dice', formula: '1d4' } })).toBeNull();
    (gate as (() => void) | null)?.();
    await reloading;
    await rig.settle();
    const held = rig.store.layout('phone');
    expect(held.slots[14]).toEqual({ k: 'dice', formula: '1d4' });
    expect(lastLayout(phone)).toEqual(held);
    expect(lastLayout(second)).toEqual(held);
    rig.timers.advance(LAYOUT_SAVE_QUIET_MS);
    await rig.settings.saveSettingsNow();
    expect(storedPhone(data)).toEqual(JSON.parse(JSON.stringify(held)));
  });
});
