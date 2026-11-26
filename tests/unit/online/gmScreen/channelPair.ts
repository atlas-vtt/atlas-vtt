import { webcrypto } from 'node:crypto';
import { DeviceChannel, GmChannel, linkKey, type ChannelCrypto } from '../../../../src/app/online/gmScreen/channel/index.ts';
import type { DeviceMessage, DeviceWire, GmScreenMessage, GmScreenWire } from '../../../../src/app/online/protocol/index.ts';
import { fromBase64 } from '../../../../src/app/utils/base64';
import { fakeTimers } from './fakeTimers.ts';

/** Node's Web Crypto, with random bytes from its source, or from `script` while it has some. */
export function nodeCrypto(script: string[] = []): ChannelCrypto {
  return {
    subtle: webcrypto.subtle as SubtleCrypto,
    random: (bytes) => {
      const next = script.shift();
      return next === undefined ? webcrypto.getRandomValues(new Uint8Array(bytes)) : fromBase64(next);
    },
  };
}

/** Atlas's end and a device's end of one channel, with what each sent still in the relay's hands. */
export interface ChannelPair {
  readonly gm: GmChannel;
  readonly device: DeviceChannel;
  /** What Atlas sent the device and the device sent Atlas, not yet delivered: a test may drop, change or repeat them. */
  readonly toDevice: GmScreenWire[];
  readonly toGm: DeviceWire[];
  /** Every body either end ever sent, as the relay saw it. */
  readonly wire: string[];
  readonly gmHeard: DeviceMessage[];
  readonly deviceHeard: GmScreenMessage[];
  readonly opened: { gm: number; device: number };
  readonly versions: { gm: number[]; device: number[] };
  /** Atlas's clock. */
  readonly timers: ReturnType<typeof fakeTimers>;
  /** Hands on everything either end sent, both ways, until neither has anything more to say. */
  deliver(): Promise<void>;
  /** Lets `ms` pass on Atlas's clock, then delivers what that made either end send. */
  elapse(ms: number): Promise<void>;
}

/** Text through JSON, as the relay carries it. */
const overWire = (body: unknown): unknown => JSON.parse(JSON.stringify(body));

/** A pair under one link (`key`, base64url), each end with its own random source. */
export async function channelPair(key: string, gmRandom: string[] = [], deviceRandom: string[] = []): Promise<ChannelPair> {
  const gmCrypto = nodeCrypto(gmRandom);
  const deviceCrypto = nodeCrypto(deviceRandom);
  const [gmLink, deviceLink] = await Promise.all([linkKey(gmCrypto, key), linkKey(deviceCrypto, key)]);
  if (gmLink === null || deviceLink === null) throw new Error('no link key');
  const toDevice: GmScreenWire[] = [];
  const toGm: DeviceWire[] = [];
  const wire: string[] = [];
  const gmHeard: DeviceMessage[] = [];
  const deviceHeard: GmScreenMessage[] = [];
  const opened = { gm: 0, device: 0 };
  const versions = { gm: [] as number[], device: [] as number[] };
  const timers = fakeTimers();
  const gm = new GmChannel(gmCrypto, gmLink, timers, (body) => {
    wire.push(JSON.stringify(body));
    toDevice.push(body);
  }, { opened: () => (opened.gm += 1), message: (message) => gmHeard.push(message), otherVersion: (version) => versions.gm.push(version) });
  const device = new DeviceChannel(deviceCrypto, deviceLink, (body) => {
    wire.push(JSON.stringify(body));
    toGm.push(body);
  }, { opened: () => (opened.device += 1), message: (message) => deviceHeard.push(message), otherVersion: (version) => versions.device.push(version) });
  const deliver = async (): Promise<void> => {
    while (toDevice.length > 0 || toGm.length > 0) {
      const down = toDevice.shift();
      if (down !== undefined) await device.receive(overWire(down));
      const up = toGm.shift();
      if (up !== undefined) await gm.receive(overWire(up));
    }
  };
  const elapse = async (ms: number): Promise<void> => {
    timers.advance(ms);
    // What a timer started runs in its turn: let it run before delivering.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await deliver();
  };
  return { gm, device, toDevice, toGm, wire, gmHeard, deviceHeard, opened, versions, timers, deliver, elapse };
}
