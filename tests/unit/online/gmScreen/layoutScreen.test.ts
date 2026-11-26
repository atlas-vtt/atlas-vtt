// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLayout } from '../../../../src/app/online/gmScreen/keys/defaultLayouts.ts';
import { LayoutScreen } from '../../../../src/app/online/gmScreen/keys/LayoutScreen.ts';
import { LAYOUT_SAVE_QUIET_MS, settingsLayouts } from '../../../../src/app/online/gmScreen/keys/settingsLayouts.ts';
import { GRID_SLOTS, type GmScreenLayout, type LayoutSlot } from '../../../../src/app/online/protocol/index.ts';
import { memoryPluginData } from '../../../mocks/pluginData';
import { allowedDevice, keysRig, settleUntil } from './keysRig.ts';
import { joinedDevice, lastLayout, layoutHeard, layoutRig, worldLibrary } from './layoutRig.ts';
import { deviceId, RelaySocket } from './sessionRig.ts';

const PHONE = deviceId('p');
const SECOND_PHONE = deviceId('q');
const TABLET = deviceId('t');

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const at = (layout: GmScreenLayout | undefined, ...path: number[]): LayoutSlot | undefined => {
  let slots = layout?.slots;
  for (const place of path.slice(0, -1)) {
    const slot = slots?.[place];
    slots = slot && slot.k === 'folder' && 'slots' in slot ? slot.slots : undefined;
  }
  return slots?.[path.at(-1) ?? 0];
};

describe("the Keys screen's grid on Atlas's side", () => {
  it("sends each device its own kind's grid, the default until the GM changes it, and stores nothing for a grid nobody changed", async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    const tablet = await joinedDevice(rig, TABLET);
    expect(await rig.ask(phone, 'phone')).toEqual(defaultLayout('phone'));
    expect(await rig.ask(tablet, 'tablet')).toEqual(defaultLayout('tablet'));
    expect(defaultLayout('phone').slots).toHaveLength(GRID_SLOTS.phone);
    expect(defaultLayout('tablet').slots.filter((slot) => slot !== null)).toHaveLength(15);
    await rig.settings.saveSettingsNow();
    expect(JSON.parse(JSON.stringify(rig.data.stored()))).not.toHaveProperty('gmScreenKeys');
  });

  it('sends a change from one phone to every phone after its answer, never to the tablet, and keeps it through a restart', async () => {
    const data = memoryPluginData();
    const rig = await layoutRig(data);
    const phone = await joinedDevice(rig, PHONE);
    const second = await joinedDevice(rig, SECOND_PHONE);
    const tablet = await joinedDevice(rig, TABLET);
    await rig.ask(phone, 'phone');
    await rig.ask(second, 'phone');
    await rig.ask(tablet, 'tablet');
    const heardBefore = { phone: layoutHeard(phone).length, tablet: layoutHeard(tablet).length };
    expect(await rig.edit(phone, 1, { op: 'put', at: [12], key: { k: 'mood', id: 'mood-1', name: 'whatever the page says' } })).toBeNull();
    await settleUntil(rig, () => at(lastLayout(second), 12) != null);
    expect(layoutHeard(phone).slice(heardBefore.phone).map((message) => message.t)).toEqual(['layout-answer', 'layout']);
    expect(at(lastLayout(phone), 12)).toEqual({ k: 'mood', id: 'mood-1', name: 'Mood 1' });
    expect(lastLayout(second)).toEqual(lastLayout(phone));
    await rig.settle();
    expect(layoutHeard(tablet)).toHaveLength(heardBefore.tablet);
    rig.timers.advance(LAYOUT_SAVE_QUIET_MS);
    await rig.settings.saveSettingsNow();

    RelaySocket.all = [];
    const restarted = await layoutRig(data);
    const back = await joinedDevice(restarted, PHONE);
    expect(await restarted.ask(back, 'phone')).toEqual(lastLayout(phone));
    expect(await restarted.ask(await joinedDevice(restarted, TABLET), 'tablet')).toEqual(defaultLayout('tablet'));
  });

  it('ends with one grid when two phones change the same slot and other slots at once, the later change winning its slot', async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    const second = await joinedDevice(rig, SECOND_PHONE);
    await rig.ask(phone, 'phone');
    await rig.ask(second, 'phone');
    // Both are sealed and on their way before Atlas reads either.
    await Promise.all([
      phone.say({ t: 'layout-edit', id: 1, edit: { op: 'put', at: [12], key: { k: 'dice', formula: '2d6' } } }),
      phone.say({ t: 'layout-edit', id: 2, edit: { op: 'put', at: [13], key: { k: 'dice', formula: '1d8' } } }),
      second.say({ t: 'layout-edit', id: 1, edit: { op: 'put', at: [12], key: { k: 'dice', formula: '3d4' } } }),
      second.say({ t: 'layout-edit', id: 2, edit: { op: 'remove', at: [0] } }),
    ]);
    await settleUntil(rig, () => [phone, second].every((device) => layoutHeard(device).filter((message) => message.t === 'layout-answer').length === 2));
    await rig.settle();
    const stored = rig.store.layout('phone');
    expect(lastLayout(phone)).toEqual(stored);
    expect(lastLayout(second)).toEqual(stored);
    expect(at(stored, 12)).toEqual({ k: 'dice', formula: '3d4' });
    expect(at(stored, 13)).toEqual({ k: 'dice', formula: '1d8' });
    expect(at(stored, 0)).toBeNull();
  });

  it('shows a grid naming what this Atlas does not know as it is, and keeps it when another slot is saved', async () => {
    const newer = { k: 'timer', seconds: 60 };
    const stored = {
      ...defaultLayout('phone'),
      slots: [{ k: 'mood', id: 'gone', name: 'Old tavern' }, { k: 'roll', id: 'gone', name: 'Old attack' }, { k: 'command', command: 'teleport' }, newer, ...defaultLayout('phone').slots.slice(4)],
    };
    const rig = await layoutRig(memoryPluginData({ gmScreenKeys: { phone: stored, watch: { slots: [] } } }));
    const phone = await joinedDevice(rig, PHONE);
    expect(JSON.parse(JSON.stringify(await rig.ask(phone, 'phone')))).toEqual(stored);
    expect(await rig.edit(phone, 1, { op: 'put', at: [14], key: { k: 'roll', id: 'attack' } })).toBeNull();
    rig.timers.advance(LAYOUT_SAVE_QUIET_MS);
    await rig.settings.saveSettingsNow();
    const saved = (rig.data.stored() as { gmScreenKeys: Record<string, { slots: unknown[] }> }).gmScreenKeys;
    expect(saved.phone?.slots.slice(0, 4)).toEqual(stored.slots.slice(0, 4));
    expect(saved.phone?.slots[14]).toEqual({ k: 'roll', id: 'attack', name: 'Attack' });
    expect(saved.watch).toEqual({ slots: [] });
  });

  it('refuses every hostile change with its reason and leaves the grid as it was', async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    expect(await rig.edit(phone, 1, { op: 'remove', at: [0] })).toBe('no-layout');
    await rig.ask(phone, 'phone');
    expect(await rig.edit(phone, 2, { op: 'put', at: [12], key: { k: 'folder', name: 'One', glyph: 'skull' } })).toBeNull();
    expect(await rig.edit(phone, 3, { op: 'put', at: [12, 0], key: { k: 'folder', name: 'Two', glyph: 'skull' } })).toBeNull();
    expect(await rig.edit(phone, 4, { op: 'put', at: [12, 0, 0], key: { k: 'folder', name: 'Three', glyph: 'skull' } })).toBeNull();
    await rig.settle();
    const before = JSON.stringify(rig.store.layout('phone'));
    const sent = layoutHeard(phone).filter((message) => message.t === 'layout').length;
    const hostile: Array<[Record<string, unknown>, string]> = [
      [{ op: 'remove', at: [GRID_SLOTS.phone] }, 'malformed'],
      [{ op: 'remove', at: [-1] }, 'malformed'],
      [{ op: 'remove', at: [0, 0] }, 'no-slot'],
      [{ op: 'put', at: [12, 0, 0, 0], key: { k: 'folder', name: 'Four', glyph: 'skull' } }, 'too-deep'],
      [{ op: 'move', from: [12, 0], to: [13, 0] }, 'no-slot'],
      [{ op: 'put', at: [13], key: { k: 'folder', name: 'Other', glyph: 'skull' } }, ''],
      [{ op: 'move', from: [12], to: [13, 0] }, 'too-deep'],
      [{ op: 'move', from: [12], to: [12, 0, 0, 1] }, 'into-itself'],
      [{ op: 'put', at: [14], key: { k: 'dice', formula: '101d6' } }, 'bad-formula'],
      [{ op: 'put', at: [14], key: { k: 'dice', formula: '1d6'.repeat(40) } }, 'bad-formula'],
      [{ op: 'put', at: [14], key: { k: 'dice', formula: '1d6'.repeat(70) } }, 'malformed'],
      [{ op: 'put', at: [14], key: { k: 'timer', seconds: 5 } }, 'malformed'],
      [{ op: 'put', at: [14], key: '<img src=x onerror=alert(1)>' }, 'malformed'],
      [{ op: 'put', at: [14], key: { k: 'command', command: 'showHoveredImage' } }, 'unknown-command'],
      [{ op: 'put', at: [14], key: { k: 'command', command: 'level' } }, 'unknown-command'],
      [{ op: 'put', at: [14], key: { k: 'mood', id: 'gone' } }, 'no-mood'],
      [{ op: 'put', at: [14], key: { k: 'roll', id: 'gone' } }, 'no-roll'],
      [{ op: 'put', at: [14], key: { k: 'folder', name: 'Odd', glyph: 'unicorn' } }, 'unknown-glyph'],
      [{ op: 'rename', at: [0], name: 'Sound', glyph: 'music' }, 'not-folder'],
      [{ op: 'explode', at: [0] }, 'malformed'],
    ];
    let id = 10;
    for (const [edit, reason] of hostile) {
      id += 1;
      const answer = await rig.edit(phone, id, edit);
      if (reason === '') expect(answer).toBeNull();
      else expect(answer, JSON.stringify(edit)).toBe(reason);
    }
    // The one change taken above (a second folder at 13) is all that changed.
    const after = rig.store.layout('phone');
    expect(JSON.stringify({ ...after, slots: after.slots.map((slot, place) => (place === 13 ? null : slot)) })).toBe(before);
    await rig.settle();
    expect(layoutHeard(phone).filter((message) => message.t === 'layout')).toHaveLength(sent + 1);
  });

  it('never reads a change larger than a device may send', async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    await rig.ask(phone, 'phone');
    const before = JSON.stringify(rig.settings.getGmScreenKeys());
    expect(await phone.say({ t: 'layout-edit', id: 1, edit: { op: 'remove', at: [0], padding: 'x'.repeat(3000) } })).toBe(false);
    // A frame sealed past the limit is dropped by the wire's reader before anything is opened.
    rig.socket().receive({ t: 'game', from: PHONE, body: { t: 'sealed', n: 99, d: 'A'.repeat(8000) } });
    await rig.settle();
    expect(JSON.stringify(rig.settings.getGmScreenKeys())).toBe(before);
    expect(layoutHeard(phone).filter((message) => message.t === 'layout-answer')).toEqual([]);
  });

  it('builds a folder, fills it, moves a key out of it and removes it', async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    await rig.ask(phone, 'phone');
    expect(await rig.edit(phone, 1, { op: 'put', at: [12], key: { k: 'folder', name: 'Fight', glyph: 'swords' } })).toBeNull();
    expect(await rig.edit(phone, 2, { op: 'move', from: [11], to: [12, 3] })).toBeNull();
    expect(await rig.edit(phone, 3, { op: 'rename', at: [12], name: 'Combat', glyph: 'shield' })).toBeNull();
    await settleUntil(rig, () => (at(lastLayout(phone), 12) as { name?: string } | undefined)?.name === 'Combat');
    expect(at(lastLayout(phone), 11)).toBeNull();
    expect(at(lastLayout(phone), 12, 3)).toEqual({ k: 'dice', formula: '1d20' });
    expect((at(lastLayout(phone), 12) as { slots: unknown[] }).slots).toHaveLength(GRID_SLOTS.phone - 1);
    expect(await rig.edit(phone, 4, { op: 'move', from: [12, 3], to: [11] })).toBeNull();
    expect(await rig.edit(phone, 5, { op: 'remove', at: [12] })).toBeNull();
    await rig.settle();
    expect(lastLayout(phone)).toEqual(defaultLayout('phone'));
    // Back at the default, nothing of the grid is stored.
    rig.timers.advance(LAYOUT_SAVE_QUIET_MS);
    expect(rig.settings.getGmScreenKeys()).toEqual({});
  });

  it('sends phones the grid a change on another computer brought into the settings, and the tablet nothing', async () => {
    const data = memoryPluginData();
    const rig = await layoutRig(data);
    const phone = await joinedDevice(rig, PHONE);
    const tablet = await joinedDevice(rig, TABLET);
    await rig.ask(phone, 'phone');
    await rig.ask(tablet, 'tablet');
    const tabletHeard = layoutHeard(tablet).length;
    const synced = { ...defaultLayout('phone'), slots: [{ k: 'moods' }, ...defaultLayout('phone').slots.slice(1)] };
    data.set({ gmScreenKeys: { phone: synced } });
    await rig.settings.reload();
    await settleUntil(rig, () => JSON.stringify(lastLayout(phone)) === JSON.stringify(synced));
    await rig.settle();
    expect(layoutHeard(tablet)).toHaveLength(tabletHeard);
  });
});

describe("a device's kind", () => {
  it('stays the first one it asked for while its channel is open: asking for the other kind in a loop sends no grid', async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    await rig.ask(phone, 'phone');
    const heard = layoutHeard(phone).length;
    for (let turn = 0; turn < 40; turn += 1) expect(await phone.say({ t: 'layout-ask', device: turn % 2 === 0 ? 'tablet' : 'phone' })).toBe(true);
    await rig.settle();
    expect(layoutHeard(phone)).toHaveLength(heard);
    expect(lastLayout(phone)).toEqual(defaultLayout('phone'));
  });

  it("keeps a phone that asks as a tablet from changing the tablet's grid: its changes go to the phones' grid", async () => {
    const rig = await layoutRig();
    const phone = await joinedDevice(rig, PHONE);
    const tablet = await joinedDevice(rig, TABLET);
    await rig.ask(phone, 'phone');
    await rig.ask(tablet, 'tablet');
    const tabletHeard = layoutHeard(tablet).length;
    expect(await phone.say({ t: 'layout-ask', device: 'tablet' })).toBe(true);
    expect(await rig.edit(phone, 1, { op: 'remove', at: [0] })).toBeNull();
    await rig.settle();
    expect(rig.settings.getGmScreenKeys().tablet).toBeUndefined();
    expect(layoutHeard(tablet)).toHaveLength(tabletHeard);
    expect(at(lastLayout(phone), 0)).toBeNull();
    expect(lastLayout(phone)?.slots).toHaveLength(GRID_SLOTS.phone);
  });

  it('is asked for anew once the device left and came back', async () => {
    const rig = await layoutRig();
    const device = await joinedDevice(rig, PHONE);
    await rig.ask(device, 'phone');
    rig.socket().receive({ t: 'player-left', id: PHONE });
    await rig.settle();
    const back = await rig.device(PHONE);
    rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Device' });
    await settleUntil(rig, () => back.heard.some((message) => message.t === 'your-code'));
    expect(await rig.ask(back, 'tablet')).toEqual(defaultLayout('tablet'));
  });
});

describe('a page that knows no grid', () => {
  it('gets the Keys screen as before and no layout message, beside a device that asks', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const rig = await keysRig();
    const store = settingsLayouts({ getGmScreenKeys: () => ({}), setGmScreenKeys: () => undefined, onChange: () => () => undefined }, rig.timers);
    rig.session.plug(new LayoutScreen({ store, library: () => worldLibrary(rig.world), outlet: rig.session, timers: rig.timers }));
    const older = await allowedDevice(rig, PHONE);
    const newer = await allowedDevice(rig, TABLET);
    expect(await newer.say({ t: 'layout-ask', device: 'tablet' })).toBe(true);
    await settleUntil(rig, () => lastLayout(newer) !== undefined);
    await rig.press(older, 1, { type: 'nextMood' });
    expect(older.heard.map((message) => message.t)).toEqual(['your-code', 'moods', 'keys', 'press-answer']);
    expect(lastLayout(newer)).toEqual(defaultLayout('tablet'));
  });
});
