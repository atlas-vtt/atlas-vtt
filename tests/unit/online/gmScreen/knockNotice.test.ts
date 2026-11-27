import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gmScreenControlShown, showingGmScreenControl } from '../../../../src/app/online/gmScreen/gmScreenSlot.ts';
import { noticeKnocks } from '../../../../src/app/online/gmScreen/knockNotice.ts';
import { deviceId, RelaySocket, sessionRig } from './sessionRig.ts';

beforeEach(() => {
  RelaySocket.all = [];
});
afterEach(() => vi.unstubAllGlobals());

async function knocking(): Promise<{ rig: ReturnType<typeof sessionRig>; told: string[] }> {
  const rig = sessionRig();
  const told: string[] = [];
  noticeKnocks(rig.session, gmScreenControlShown, (text) => void told.push(text));
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  return { rig, told };
}

describe('a device that asks to join while the DM screen is closed', () => {
  it('is named in one notice that says where to allow it', async () => {
    const { rig, told } = await knocking();
    rig.socket().receive({ t: 'knock', id: deviceId('p'), name: 'Mira\'s phone' });
    await rig.settle();
    await rig.settle();
    expect(told).toEqual(['Mira\'s phone asks to join Sidekick. Open the DM screen to allow it.']);
    rig.socket().receive({ t: 'knock', id: deviceId('t'), name: 'Tablet' });
    await rig.settle();
    expect(told).toHaveLength(1);
    rig.session.refuse(deviceId('p'));
    await rig.settle();
    expect(told.at(-1)).toBe('Tablet asks to join Sidekick. Open the DM screen to allow it.');
  });

  it('needs no notice while a DM screen shows the control, whose panel opens itself', async () => {
    const shown = showingGmScreenControl();
    const { rig, told } = await knocking();
    rig.socket().receive({ t: 'knock', id: deviceId('p'), name: 'Phone' });
    await rig.settle();
    expect(told).toEqual([]);
    shown();
    shown();
    expect(gmScreenControlShown()).toBe(false);
  });
});
