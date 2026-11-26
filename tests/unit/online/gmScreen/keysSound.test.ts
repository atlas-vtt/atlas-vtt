// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import { allowedDevice, heardOf, keysRig, sealedTo, settleUntil, type KeysRig } from './keysRig.ts';
import { deviceId, RelaySocket, type Device } from './sessionRig.ts';

const PHONE = deviceId('p');
const TABLET = deviceId('t');

beforeEach(() => {
  RelaySocket.all = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const lastKeys = (device: Device): Extract<GmScreenMessage, { t: 'keys' }>['state'] | undefined => heardOf(device, 'keys').at(-1)?.state;

/** A finger on a fader for two seconds: a level every 100 ms, as the page sends them, each answered before the next. */
async function dragOnDevice(rig: KeysRig, device: Device, levels: readonly number[]): Promise<void> {
  for (const [index, db] of levels.entries()) {
    await rig.press(device, index + 1, { type: 'level', channel: 'music', db });
    rig.tick(100);
  }
  rig.tick(1000);
  await settleUntil(rig, () => lastKeys(device)?.levels.musicDb === levels.at(-1));
}

describe('the Sound screen\'s levels', () => {
  it('move Master on this computer and Music and Ambience in the mix from a device, and show where they went', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    expect(lastKeys(phone)?.levels).toEqual({ masterDb: 0, musicDb: -4, ambienceDb: -6 });
    await rig.press(phone, 1, { type: 'level', channel: 'master', db: -12 });
    await rig.press(phone, 2, { type: 'level', channel: 'music', db: -20 });
    await rig.press(phone, 3, { type: 'level', channel: 'ambience', db: -10 });
    await rig.press(phone, 4, { type: 'level', channel: 'musicStrip', deltaDb: 2 });
    const { director } = rig.world;
    expect(director.setChannelLevels).toHaveBeenCalledWith({ masterDb: -12 }, false);
    expect(director.desk.setMusicLevel.mock.calls).toEqual([[-20], [-18]]);
    // Every layer moves by what takes the loudest to the level: the quieter one keeps its distance.
    expect(director.desk.setLayerLevels).toHaveBeenCalledWith(new Map([['rain', -10], ['wind', -13]]));
    rig.tick(1000);
    await settleUntil(rig, () => lastKeys(phone)?.levels.musicDb === -18);
    expect(lastKeys(phone)?.levels).toEqual({ masterDb: -12, musicDb: -18, ambienceDb: -10 });
    expect(heardOf(phone, 'press-answer').map((answer) => answer.refused)).toEqual([null, null, null, null]);
  });

  it('follow a fader moved in Atlas, and one moved on another device', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    const tablet = await allowedDevice(rig, TABLET, 'Tablet');
    rig.world.director.setChannelLevels({ masterDb: -7 }, false);
    rig.tick(1000);
    await settleUntil(rig, () => lastKeys(phone)?.levels.masterDb === -7 && lastKeys(tablet)?.levels.masterDb === -7);
    await rig.press(tablet, 1, { type: 'level', channel: 'ambience', db: -30 });
    rig.tick(1000);
    await settleUntil(rig, () => lastKeys(phone)?.levels.ambienceDb === -30);
    expect(heardOf(phone, 'press-answer')).toEqual([]);
  });

  it('never show a device an older level after the answer to its newer one, so its fader does not jump back', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    phone.heard.length = 0;
    const levels = Array.from({ length: 20 }, (_, index) => -40 + index);
    await dragOnDevice(rig, phone, levels);
    let answered: number | null = null;
    for (const message of phone.heard) {
      if (message.t === 'press-answer') answered = levels[message.id - 1] ?? null;
      if (message.t === 'keys') expect(message.state.levels.musicDb).toBe(answered);
    }
  });

  it('are refused, and say so, while sound is switched off', async () => {
    const rig = await keysRig();
    rig.world.director.isOn = false;
    const phone = await allowedDevice(rig, PHONE);
    expect(lastKeys(phone)).toMatchObject({ soundOn: false, levels: { musicDb: null, ambienceDb: null } });
    await rig.press(phone, 1, { type: 'level', channel: 'music', db: -3 });
    await rig.press(phone, 2, { type: 'stopAll' });
    expect(heardOf(phone, 'press-answer').map((answer) => answer.refused)).toEqual(['sound-off', 'sound-off']);
    expect(rig.world.director.desk.setMusicLevel).not.toHaveBeenCalled();
  });
});

describe('what the Keys and Sound screens cost in frames into the relay', () => {
  it('a fader dragged in Atlas for two seconds: one state every 200 ms to each device', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    const tablet = await allowedDevice(rig, TABLET, 'Tablet');
    const before = [sealedTo(rig.socket(), PHONE), sealedTo(rig.socket(), TABLET)];
    // A pointer moving a fader on the Sound page: a new level every frame of a 60 Hz screen.
    for (let at = 0; at < 2000; at += 16) {
      rig.world.director.desk.setMusicLevel(-40 + at / 100);
      rig.tick(16);
    }
    rig.tick(1000);
    await settleUntil(rig, () => lastKeys(phone)?.levels.musicDb === -40 + 1984 / 100 && lastKeys(tablet)?.levels.musicDb === -40 + 1984 / 100);
    const sent = [sealedTo(rig.socket(), PHONE) - before[0], sealedTo(rig.socket(), TABLET) - before[1]];
    expect(sent).toEqual([11, 11]);
  });

  it('a fader dragged on a device for two seconds: an answer per level, and the state every 200 ms', async () => {
    const rig = await keysRig();
    const phone = await allowedDevice(rig, PHONE);
    const tablet = await allowedDevice(rig, TABLET, 'Tablet');
    const before = [sealedTo(rig.socket(), PHONE), sealedTo(rig.socket(), TABLET)];
    await dragOnDevice(rig, phone, Array.from({ length: 20 }, (_, index) => -30 + index));
    await settleUntil(rig, () => lastKeys(tablet)?.levels.musicDb === -11);
    const sent = [sealedTo(rig.socket(), PHONE) - before[0], sealedTo(rig.socket(), TABLET) - before[1]];
    expect(heardOf(phone, 'press-answer')).toHaveLength(20);
    expect(sent).toEqual([31, 11]);
  });
});
