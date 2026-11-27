import { describe, expect, it } from 'vitest';
import { messageParts } from '../../../../src/app/online/gm/assetServe.ts';
import {
  DRAWN_CLASSES, MAX_DEVICE_MESSAGE, MAX_DRAWN_CLASSES, MAX_GM_FRAME, MAX_GM_SCREEN_MESSAGE, MAX_PARTS, MAX_PLAYER_FRAME, MAX_SEAL_COUNTER, PROTOCOL_VERSION, parseDeviceMessage, parseDeviceWire, parseGmMessage, parseGmScreenMessage,
  parseGmScreenWire, readGmScreenLink, type DeviceMessage, type GmMessage, type GmScreenMessage,
} from '../../../../src/app/online/protocol/index.ts';
import { readGmScreenRecord } from '../../../../src/app/online/gmScreen/index.ts';
import { fromBase64 } from '../../../../src/app/utils/base64';
import { channelPair, nodeCrypto } from './channelPair';
import { newLinkKey } from '../../../../src/app/online/gmScreen/channel/index.ts';

const KEY = newLinkKey(nodeCrypto());
const bytesOf = (message: unknown): number => new TextEncoder().encode(JSON.stringify(message)).length;

/** A press whose JSON is exactly `size` bytes. */
function pressOf(size: number): DeviceMessage {
  const empty = { t: 'press', id: 1, command: { type: 'mood', id: '' } } as const;
  return { ...empty, command: { type: 'mood', id: 'm'.repeat(size - bytesOf(empty)) } };
}

/** A drawn statblock whose JSON is exactly `size` bytes: elements with the most and longest classes a statblock keeps, and a text to fill up. */
function statblockOf(size: number): GmScreenMessage {
  const element = { e: 'div', c: [...DRAWN_CLASSES].sort((a, b) => b.length - a.length).slice(0, MAX_DRAWN_CLASSES) } as const;
  const count = Math.floor((size - 200) / (bytesOf(element) + 1));
  const empty = { t: 'statblock', id: 'big', nodes: [...Array.from({ length: count }, () => element), ''], cut: false } as const;
  return { ...empty, nodes: [...empty.nodes.slice(0, -1), 'x'.repeat(size - bytesOf(empty))] };
}

/** The frame a page sends with a message for Atlas, as `PlayConnection.send` writes it. */
const pageFrame = (body: unknown): string => JSON.stringify({ v: PROTOCOL_VERSION, t: 'send', body });
/** The frame Atlas sends with a message for one device, as `TableConnection.send` writes it. */
const gmFrame = (body: GmMessage): string => JSON.stringify({ v: PROTOCOL_VERSION, t: 'send', to: 'abcdefghijklmnopqrst', body });

/** A message in parts put together again, as the page does before it reads it. */
function joined(parts: readonly GmMessage[]): unknown {
  const chunks = parts.map((part) => (part.t === 'part' ? fromBase64(part.data) : new Uint8Array(0)));
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

describe('the GM screen\'s frames at the relay', () => {
  it('fit a device\'s largest message into one frame of a player, with the highest counter; a byte more is not sent', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    await pair.deliver();
    expect(bytesOf(pressOf(MAX_DEVICE_MESSAGE))).toBe(MAX_DEVICE_MESSAGE);
    expect(await pair.device.send(pressOf(MAX_DEVICE_MESSAGE))).toBe(true);
    const [frame] = pair.toGm;
    if (frame?.t !== 'sealed') throw new Error('nothing sealed');
    expect(pageFrame({ ...frame, n: MAX_SEAL_COUNTER }).length).toBeLessThanOrEqual(MAX_PLAYER_FRAME);
    expect(parseDeviceWire({ ...frame, n: MAX_SEAL_COUNTER })).not.toBeNull();
    await pair.deliver();
    expect(pair.gmHeard).toEqual([pressOf(MAX_DEVICE_MESSAGE)]);
    expect(await pair.device.send(pressOf(MAX_DEVICE_MESSAGE + 1))).toBe(false);
  });

  it('send Atlas\'s largest message in parts that each fit a GM\'s frame, which put together open to the message', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    await pair.deliver();
    const message = statblockOf(MAX_GM_SCREEN_MESSAGE);
    expect(bytesOf(message)).toBe(MAX_GM_SCREEN_MESSAGE);
    expect(await pair.gm.send(message)).toBe(true);
    const sealed = pair.toDevice.pop();
    if (sealed?.t !== 'sealed') throw new Error('nothing sealed');
    const parts = messageParts(sealed, () => 'a'.repeat(24));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.length).toBeLessThanOrEqual(MAX_PARTS);
    for (const part of parts) expect(gmFrame(part).length).toBeLessThanOrEqual(MAX_GM_FRAME);
    const whole = parseGmMessage(joined(parts));
    expect(whole).toEqual(sealed);
    await pair.device.receive(whole);
    expect(pair.deviceHeard).toEqual([message]);
    expect(await pair.gm.send(statblockOf(MAX_GM_SCREEN_MESSAGE + 1))).toBe(false);
  });

  it('send a small message of Atlas whole, in one frame', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    const open = pair.toDevice[0];
    await pair.deliver();
    await pair.gm.send({ t: 'press-answer', id: 1, refused: 'no-scene' });
    const [sealed] = pair.toDevice;
    if (open === undefined || sealed === undefined) throw new Error('nothing sent');
    for (const body of [open, sealed]) {
      expect(messageParts(body, () => 'unused')).toEqual([body]);
      expect(parseGmMessage(JSON.parse(gmFrame(body)).body)).toEqual(body);
    }
  });
});

describe('the GM screen\'s wire parsers', () => {
  const opening = 'oKGio6SlpqeoqaqrrK2urw==';
  const sealed = { t: 'sealed', n: 1, d: 'qDNrxyrNDX1tXCv5K9tJ9lJsTnFxvS02eSmumXkywrA2AsZX+CMC5dyVDx1uP9cZrxxlr8I/9z6yEg==' };

  it('read every body each way', () => {
    expect(parseGmScreenWire(sealed)).toEqual(sealed);
    expect(parseGmScreenWire({ t: 'seal-open', v: 1, r: opening })).toEqual({ t: 'seal-open', v: 1, r: opening });
    expect(parseDeviceWire(sealed)).toEqual(sealed);
    expect(parseDeviceWire({ t: 'seal-answer', v: 1, to: opening, r: opening })).toEqual({ t: 'seal-answer', v: 1, to: opening, r: opening });
    expect(parseDeviceWire({ t: 'seal-ask', v: 1, extra: 'dropped' })).toEqual({ t: 'seal-ask', v: 1 });
  });

  it('refuse malformed bodies without throwing', () => {
    const tooLong = { ...sealed, d: 'A'.repeat(4096) };
    const bodies: unknown[] = [
      null, 7, 'sealed', [], {}, { t: 'sealed' }, { ...sealed, n: 0 }, { ...sealed, n: -1 }, { ...sealed, n: 1.5 }, { ...sealed, n: '1' }, { ...sealed, n: MAX_SEAL_COUNTER + 2 },
      { ...sealed, d: '' }, { ...sealed, d: 'AAAA' }, { ...sealed, d: `${sealed.d.slice(1)}` }, { ...sealed, d: `${sealed.d.slice(0, -4)}<>==` }, { ...sealed, d: 7 },
      { t: 'seal-open', v: 0, r: opening }, { t: 'seal-open', v: 1.5, r: opening }, { t: 'seal-open', v: '1', r: opening }, { t: 'seal-open', v: 1, r: 'oKGio6SlpqeoqaqrrK2urx==' },
      { t: 'seal-open', v: 1, r: opening.slice(1) }, { t: 'seal-open', v: 1 }, { t: 'seal-answer', v: 1, r: opening }, { t: 'seal-ask' }, { t: 'seal-ask', v: 0 }, { t: 'other', v: 1 },
    ];
    for (const body of bodies) {
      expect(() => [parseGmScreenWire(body), parseDeviceWire(body)]).not.toThrow();
      expect([parseGmScreenWire(body), parseDeviceWire(body)], JSON.stringify(body)).toEqual([null, null]);
    }
    // A frame that may come from Atlas is too large from a device, and Atlas sends no answers or asks.
    expect([parseGmScreenWire(tooLong), parseDeviceWire(tooLong)]).toEqual([tooLong, null]);
    expect(parseGmScreenWire({ t: 'seal-ask', v: 1 })).toBeNull();
    expect(parseDeviceWire({ t: 'seal-open', v: 1, r: opening })).toBeNull();
  });

  it('throw on no hostile value, and neither do the readers of messages, links and the kept record', () => {
    const hostile: unknown[] = [
      null, undefined, 0, '', [], {}, { t: 'sealed' }, { t: 'sealed', n: 1e400, d: 'A'.repeat(24) }, { t: 'sealed', n: 1, d: '='.repeat(24) }, { t: 'sealed', n: 1, d: `${'A'.repeat(22)}==` },
      { t: 'seal-answer', v: 1, to: {}, r: [] }, { t: 'seal-open', v: 1.5, r: 'x' }, JSON.parse('{"__proto__":{"t":"sealed"},"t":"seal-ask","v":1}'), { t: 'press' }, { t: 'your-code', code: {} },
      'x'.repeat(5000), '#.', '#a.b', `#${'a'.repeat(26)}.`, { link: { code: 'a'.repeat(26), key: 'k' }, ending: [{ code: {}, secret: [] }] },
    ];
    for (const value of hostile) {
      expect(() => [parseDeviceWire(value), parseGmScreenWire(value), parseDeviceMessage(value), parseGmScreenMessage(value), readGmScreenLink(value), readGmScreenRecord(value)]).not.toThrow();
    }
  });
});
