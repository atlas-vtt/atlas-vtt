import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM_MS } from '../../../../src/app/online/gm/armedCards.ts';
import { LOOK_SETTLE_MS, LookScreen } from '../../../../src/app/online/gmScreen/look/LookScreen.ts';
import type { LookMessage } from '../../../../src/app/online/protocol/index.ts';
import { deviceId, RelaySocket, sessionRig, type Device, type Rig } from './sessionRig.ts';

const PHONE = deviceId('p');
const DAY: LookMessage = { t: 'look', dark: false, colours: { '--background-primary': '#f5eddc', '--interactive-accent': '#2e9e44' } };
const NIGHT: LookMessage = { t: 'look', dark: true, colours: { '--background-primary': '#23201b', '--interactive-accent': '#e8772e' } };

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

const looksOf = (device: Device): LookMessage[] => device.heard.filter((message): message is LookMessage => message.t === 'look');

/** A running session with the look plugged in, reading whatever `shown` holds. */
async function lookRig(): Promise<{ rig: Rig; screen: LookScreen; show: (look: LookMessage) => void }> {
  const rig = sessionRig();
  let shown = DAY;
  const screen = new LookScreen({ read: () => shown, outlet: rig.session, timers: rig.timers });
  rig.session.plug(screen);
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  return { rig, screen, show: (look) => void (shown = look) };
}

async function allowed(rig: Rig, id: string): Promise<Device> {
  const device = await rig.device(id);
  rig.socket().receive({ t: 'knock', id, name: 'Phone' });
  await rig.settle();
  rig.timers.advance(ARM_MS);
  expect(rig.session.allow(id)).toBe(true);
  rig.socket().receive({ t: 'player-joined', id, name: 'Phone' });
  await rig.settle();
  return device;
}

describe('the GM\'s look on its way to a device', () => {
  it('reaches a device once it is let in and its channel opened, sealed like every message', async () => {
    const { rig } = await lookRig();
    const device = await allowed(rig, PHONE);
    expect(looksOf(device)).toEqual([DAY]);
    expect(JSON.stringify(rig.socket().frames())).not.toContain('#f5eddc');
  });

  it('reaches it again when it comes back after the connection dropped', async () => {
    const { rig } = await lookRig();
    const device = await allowed(rig, PHONE);
    rig.socket().drop();
    rig.timers.advance(1_000);
    rig.socket().welcome([{ id: PHONE, name: 'Phone' }]);
    await rig.settle();
    expect(looksOf(device)).toEqual([DAY, DAY]);
  });

  it('follows a change in Obsidian with one look, and stays quiet for an announcement that changed nothing', async () => {
    const { rig, screen, show } = await lookRig();
    const device = await allowed(rig, PHONE);
    show(NIGHT);
    screen.changed();
    screen.changed();
    rig.timers.advance(LOOK_SETTLE_MS);
    await rig.settle();
    screen.changed();
    rig.timers.advance(LOOK_SETTLE_MS);
    await rig.settle();
    expect(looksOf(device)).toEqual([DAY, NIGHT]);
  });
});
