import { App } from 'obsidian';
import { expect } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { LayoutScreen } from '../../../../src/app/online/gmScreen/keys/LayoutScreen.ts';
import type { KeyLibrary } from '../../../../src/app/online/gmScreen/keys/layoutEdits.ts';
import { settingsLayouts } from '../../../../src/app/online/gmScreen/keys/settingsLayouts.ts';
import type { GmScreenDevice, GmScreenLayout, GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import { SettingsService } from '../../../../src/app/services/SettingsService';
import { diceKeyRolls } from '../../../../src/app/soundRemote/remoteTable';
import { memoryPluginData } from '../../../mocks/pluginData';
import { settleUntil, soundWorld, type SoundWorld } from './keysRig.ts';
import { sessionRig, type Device, type Rig } from './sessionRig.ts';

type PluginData = ReturnType<typeof memoryPluginData>;
export type LayoutHeard = Extract<GmScreenMessage, { t: 'layout' | 'layout-answer' }>;

/** What a key may name in `world`: its moods, the saved rolls of its map, and what the dice tool rolls. */
export function worldLibrary(world: SoundWorld): KeyLibrary {
  return {
    moodName: (id) => world.moodSource.mood(id)?.name ?? null,
    rollName: (id) => world.table.map.savedRolls().find((roll) => roll.id === id)?.name ?? null,
    rollable: (formula) => diceKeyRolls(world.table.table, formula),
  };
}

/** The layout messages a device heard, in order. */
export const layoutHeard = (device: Device): LayoutHeard[] =>
  device.heard.filter((message): message is LayoutHeard => message.t === 'layout' || message.t === 'layout-answer');

/** The last grid a device was sent. */
export const lastLayout = (device: Device): GmScreenLayout | undefined =>
  layoutHeard(device).filter((message) => message.t === 'layout').at(-1)?.layout;

/** A device allowed in, its channel open: the session's own `your-code` reached it. */
export async function joinedDevice(rig: Rig, id: string): Promise<Device> {
  const device = await rig.device(id);
  rig.socket().receive({ t: 'knock', id, name: 'Device' });
  await settleUntil(rig, () => rig.session.view().knock?.check != null);
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(id)).toBe(true);
  rig.socket().receive({ t: 'player-joined', id, name: 'Device' });
  await settleUntil(rig, () => device.heard.some((message) => message.t === 'your-code'));
  return device;
}

/**
 * A running session with the Keys screen's grid plugged in, kept in a real `SettingsService` over `data`
 * (Atlas's `data.json`): a second rig over the same data is Atlas after a restart.
 */
export async function layoutRig(data: PluginData = memoryPluginData(), world: SoundWorld = soundWorld()) {
  const rig = sessionRig();
  const settings = new SettingsService(new App(), undefined, data);
  await settings.initialize();
  rig.session.plug(new LayoutScreen({ store: settingsLayouts(settings), library: () => worldLibrary(world), outlet: rig.session, timers: rig.timers }));
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  return {
    ...rig, settings, data, world,
    /** A device says which kind it is, and holds the grid Atlas answered with. */
    async ask(device: Device, kind: GmScreenDevice): Promise<GmScreenLayout | undefined> {
      const before = layoutHeard(device).length;
      expect(await device.say({ t: 'layout-ask', device: kind })).toBe(true);
      await settleUntil(rig, () => layoutHeard(device).slice(before).some((message) => message.t === 'layout'));
      return lastLayout(device);
    },
    /** A device sends a change, and holds Atlas's answer. */
    async edit(device: Device, id: number, edit: Record<string, unknown>): Promise<string | null | undefined> {
      expect(await device.say({ t: 'layout-edit', id, edit })).toBe(true);
      await settleUntil(rig, () => layoutHeard(device).some((message) => message.t === 'layout-answer' && message.id === id));
      return layoutHeard(device).find((message) => message.t === 'layout-answer' && message.id === id)?.refused;
    },
  };
}

export type LayoutRig = Awaited<ReturnType<typeof layoutRig>>;
