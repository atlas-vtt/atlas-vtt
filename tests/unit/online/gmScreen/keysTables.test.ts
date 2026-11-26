// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { remoteTableOf } from '@/app/plugin/soundRemoteTable';
import { PlayerWindowService } from '@/app/services/PlayerWindowService';
import type { HoveredElement } from '@/app/soundRemote/hoveredElement';
import { tableControlsStore } from '@/app/stores/tableControlsStore';
import { allowedDevice, heardOf, keysRig, settleUntil, soundWorld } from './keysRig.ts';
import { deviceId, RelaySocket, type Device } from './sessionRig.ts';

vi.mock('@/app/ui/notice', () => ({ showNotice: vi.fn() }));

const PHONE = deviceId('p');
/** Atlas without a map tab: the table as the Stream Deck reads it, from the stores and services themselves. */
const app = { workspace: { getActiveViewOfType: () => null, getLeavesOfType: () => [] } } as unknown as App;
const table = remoteTableOf(app, { element: () => null } as unknown as HoveredElement);

/** A local player window that shows the scene. */
function playerWindow() {
  const window = { frozen: false, curtain: false };
  const service = {
    isWindowOpen: () => true,
    isTrueScale: () => false,
    isFrozen: () => window.frozen,
    freezeCamera: vi.fn(() => { window.frozen = true; }),
    unfreezeCamera: vi.fn(() => { window.frozen = false; }),
    setCurtain: vi.fn((down: boolean) => { window.curtain = down; }),
  };
  vi.spyOn(PlayerWindowService, 'getInstance').mockReturnValue(service as unknown as PlayerWindowService);
  return { window, service };
}

beforeEach(() => {
  RelaySocket.all = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  tableControlsStore.setState({ curtain: false, paused: false, online: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const answers = (device: Device): Array<string | null> => heardOf(device, 'press-answer').map((answer) => answer.refused);
const player = (device: Device): unknown => heardOf(device, 'keys').at(-1)?.state.player;

describe('the Keys screen in each way of playing', () => {
  it('with neither a table nor a player window: the table keys say why they do nothing, sound keys work', async () => {
    const rig = await keysRig(soundWorld(), table);
    const phone = await allowedDevice(rig, PHONE);
    expect(heardOf(phone, 'keys')[0]?.state).toMatchObject({ combat: null, player: { open: false, online: false, frozen: false, hidden: false } });
    await rig.press(phone, 1, { type: 'curtain' });
    await rig.press(phone, 2, { type: 'freeze' });
    await rig.press(phone, 3, { type: 'combat' });
    await rig.press(phone, 4, { type: 'stopAll' });
    expect(answers(phone)).toEqual(['no-player-window', 'no-player-window', 'no-scene', null]);
    expect(tableControlsStore.getState()).toMatchObject({ curtain: false, paused: false });
  });

  it('with the players\' table online: the curtain and the pause reach its players', async () => {
    tableControlsStore.setState({ online: true });
    const rig = await keysRig(soundWorld(), table);
    const phone = await allowedDevice(rig, PHONE);
    await rig.press(phone, 1, { type: 'curtain' });
    await rig.press(phone, 2, { type: 'freeze' });
    expect(answers(phone)).toEqual([null, null]);
    expect(tableControlsStore.getState()).toMatchObject({ curtain: true, paused: true });
    rig.tick(1000);
    await settleUntil(rig, () => JSON.stringify(player(phone)) === JSON.stringify({ open: false, presented: false, frozen: true, trueScale: false, hidden: true, handout: false, online: true }));
  });

  it('tells a device when an online table starts and ends, so it knows whether the pause and the curtain reach anyone', async () => {
    const rig = await keysRig(soundWorld(), table);
    const phone = await allowedDevice(rig, PHONE);
    expect(heardOf(phone, 'keys').at(-1)?.state.player.online).toBe(false);
    tableControlsStore.setState({ online: true });
    rig.tick(200);
    await settleUntil(rig, () => heardOf(phone, 'keys').at(-1)?.state.player.online === true);
    tableControlsStore.setState({ online: false });
    rig.tick(200);
    await settleUntil(rig, () => heardOf(phone, 'keys').at(-1)?.state.player.online === false);
  });

  it('with only a local player window: the window freezes and the curtain falls on it', async () => {
    const local = playerWindow();
    const rig = await keysRig(soundWorld(), table);
    const phone = await allowedDevice(rig, PHONE);
    await rig.press(phone, 1, { type: 'freeze' });
    await rig.press(phone, 2, { type: 'curtain' });
    expect(answers(phone)).toEqual([null, null]);
    expect(local.service.freezeCamera).toHaveBeenCalledOnce();
    expect(local.service.setCurtain).toHaveBeenCalledWith(true);
    rig.tick(1000);
    await settleUntil(rig, () => JSON.stringify(player(phone)) === JSON.stringify({ open: true, presented: false, frozen: true, trueScale: false, hidden: true, handout: false, online: false }));
  });
});
