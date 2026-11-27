import { createCipheriv, hkdfSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkNumber, linkKey, newLinkKey } from '../../../../src/app/online/gmScreen/channel/index.ts';
import { GM_SCREEN_VERSION, LINK_KEY_PATTERN, type GmScreenMessage, type SealedFrame } from '../../../../src/app/online/protocol/index.ts';
import { fromBase64, toBase64 } from '../../../../src/app/utils/base64';
import { GM_SCREEN_VECTORS as V } from '../../../fixtures/gmScreenVectors';
import { channelPair, nodeCrypto, type ChannelPair } from './channelPair';

const KEY = newLinkKey(nodeCrypto());
const answer = (id: number): GmScreenMessage => ({ t: 'press-answer', id, refused: null });

async function openPair(key = KEY): Promise<ChannelPair> {
  const pair = await channelPair(key);
  await pair.gm.open();
  await pair.deliver();
  return pair;
}

/** The frames Atlas sealed, in the order they went. */
const sealedToDevice = (pair: ChannelPair): SealedFrame[] => pair.toDevice.filter((body): body is SealedFrame => body.t === 'sealed');

/** A frame with one byte of its sealed bytes changed. */
function changed(frame: SealedFrame, at: number): SealedFrame {
  const bytes = fromBase64(frame.d);
  bytes[at] = (bytes[at] ?? 0) ^ 1;
  return { ...frame, d: toBase64(bytes) };
}

describe('a GM screen channel', () => {
  it('opens with one exchange, then carries messages both ways', async () => {
    const pair = await openPair();
    expect([pair.gm.isOpen, pair.device.isOpen, pair.opened]).toEqual([true, true, { gm: 1, device: 1 }]);
    expect(await pair.gm.send(answer(7))).toBe(true);
    expect(await pair.device.send({ t: 'press', id: 7, command: { type: 'stopAll' } })).toBe(true);
    await pair.deliver();
    expect(pair.deviceHeard).toEqual([answer(7)]);
    expect(pair.gmHeard).toEqual([{ t: 'press', id: 7, command: { type: 'stopAll' } }]);
  });

  it('tells a screen its message did not leave the device where the transport could not take it', async () => {
    const pair = await openPair();
    pair.deviceTransport.up = false;
    expect(await pair.device.send({ t: 'press', id: 8, command: { type: 'stopAll' } })).toBe(false);
    expect(pair.toGm).toEqual([]);
  });

  it('seals nothing while an exchange waits for the device, and opens nothing new however often the device asks meanwhile', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    expect(await pair.gm.send(answer(1))).toBe(false);
    for (let ask = 0; ask < 3; ask += 1) await pair.gm.receive({ t: 'seal-ask', v: GM_SCREEN_VERSION });
    expect(pair.toDevice.map((body) => body.t)).toEqual(['seal-open']);
    await pair.deliver();
    expect(await pair.gm.send(answer(2))).toBe(true);
  });

  it('opens with the keys of the last opening only: an answer to an earlier one opens nothing', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    await pair.gm.open();
    await pair.deliver();
    expect(pair.opened).toEqual({ gm: 1, device: 2 });
    await pair.gm.send(answer(3));
    await pair.deliver();
    expect(pair.deviceHeard).toEqual([answer(3)]);
  });

  it('refuses a frame changed in any byte of its seal or its counter', async () => {
    const pair = await openPair();
    await pair.gm.send(answer(1));
    const [frame] = sealedToDevice(pair);
    pair.toDevice.length = 0;
    if (frame === undefined) throw new Error('nothing sealed');
    for (const at of [0, 10, fromBase64(frame.d).length - 1]) await pair.device.receive(changed(frame, at));
    await pair.device.receive({ ...frame, n: 2 });
    expect(pair.deviceHeard).toEqual([]);
    await pair.device.receive(frame);
    expect(pair.deviceHeard).toEqual([answer(1)]);
  });

  it('refuses a replayed frame and one older than the last, both ways', async () => {
    const pair = await openPair();
    await pair.gm.send(answer(1));
    await pair.gm.send(answer(2));
    const [first, second] = sealedToDevice(pair);
    await pair.deliver();
    if (first === undefined || second === undefined) throw new Error('nothing sealed');
    await pair.device.receive(second);
    await pair.device.receive(first);
    // A repeat is no reason to open the channel again.
    expect(pair.toGm).toEqual([]);
    await pair.device.send({ t: 'statblock-view', id: 'goblin' });
    const [up] = pair.toGm;
    await pair.deliver();
    if (up === undefined) throw new Error('nothing sealed');
    await pair.gm.receive(up);
    expect(pair.deviceHeard).toEqual([answer(1), answer(2)]);
    expect(pair.gmHeard).toEqual([{ t: 'statblock-view', id: 'goblin' }]);
  });

  it('refuses a frame sent the other way', async () => {
    const pair = await openPair();
    await pair.gm.send(answer(1));
    await pair.device.send({ t: 'statblock-view', id: null });
    const [down] = sealedToDevice(pair);
    const [up] = pair.toGm;
    if (down === undefined || up === undefined) throw new Error('nothing sealed');
    await pair.gm.receive(down);
    await pair.device.receive(up);
    expect([pair.gmHeard, pair.deviceHeard]).toEqual([[], []]);
  });

  it('refuses a frame of an earlier exchange, and a frame under another link', async () => {
    const pair = await openPair();
    const other = await openPair(newLinkKey(nodeCrypto()));
    await pair.gm.send(answer(1));
    const [old] = sealedToDevice(pair);
    if (old === undefined) throw new Error('nothing sealed');
    pair.toDevice.length = 0;
    await pair.gm.open();
    await pair.deliver();
    await pair.device.receive(old);
    await other.device.receive(old);
    expect([pair.deviceHeard, other.deviceHeard]).toEqual([[], []]);
  });

  it('takes a frame after missing ones, and the device asks once for a new exchange, which Atlas opens', async () => {
    const pair = await openPair();
    for (let id = 1; id <= 4; id += 1) await pair.gm.send(answer(id));
    // The room dropped the first two.
    pair.toDevice.splice(0, 2);
    await pair.device.receive(pair.toDevice.shift());
    await pair.device.receive(pair.toDevice.shift());
    expect(pair.deviceHeard).toEqual([answer(3), answer(4)]);
    expect(pair.toGm).toEqual([{ t: 'seal-ask', v: GM_SCREEN_VERSION }]);
    await pair.deliver();
    expect(pair.opened).toEqual({ gm: 2, device: 2 });
    await pair.gm.send(answer(5));
    await pair.deliver();
    expect(pair.deviceHeard.at(-1)).toEqual(answer(5));
  });

  it('asks once for an exchange when a sealed frame comes to a device that holds no keys', async () => {
    const pair = await openPair();
    const fresh = await channelPair(KEY);
    await pair.gm.send(answer(1));
    await pair.gm.send(answer(2));
    for (const frame of sealedToDevice(pair)) await fresh.device.receive(frame);
    expect(fresh.toGm).toEqual([{ t: 'seal-ask', v: GM_SCREEN_VERSION }]);
    expect(fresh.deviceHeard).toEqual([]);
  });

  it('lets no message pass between ends of another version, and says so', async () => {
    const pair = await channelPair(KEY);
    await pair.device.receive({ t: 'seal-open', v: GM_SCREEN_VERSION + 1, r: V.gmOpening });
    await pair.gm.open();
    const open = pair.toDevice.shift();
    if (open?.t !== 'seal-open') throw new Error('no opening');
    await pair.gm.receive({ t: 'seal-answer', v: GM_SCREEN_VERSION + 1, to: open.r, r: V.deviceOpening });
    expect([pair.device.isOpen, pair.gm.isOpen, pair.toGm]).toEqual([false, false, []]);
    expect(pair.versions).toEqual({ gm: [GM_SCREEN_VERSION + 1], device: [GM_SCREEN_VERSION + 1] });
  });

  it('shows the relay no plaintext: no frame holds anything placed in a message', async () => {
    const pair = await openPair();
    const marker = 'Grimtooth-hides-behind-the-door';
    await pair.gm.send({ t: 'statblock', id: 'grimtooth', nodes: [{ e: 'p', k: [marker] }], cut: false });
    await pair.device.send({ t: 'press', id: 1, command: { type: 'mood', id: marker } });
    await pair.deliver();
    expect(pair.gmHeard).toHaveLength(1);
    expect(pair.deviceHeard).toHaveLength(1);
    for (const body of pair.wire) expect(body).not.toMatch(/Grimtooth|grimtooth|statblock/);
  });
});

describe('the channel\'s keys', () => {
  it('seal exactly as the fixed vectors say, which Node\'s own HKDF and AES-GCM give too', async () => {
    const pair = await channelPair(V.link, [V.gmOpening], [V.deviceOpening]);
    await pair.gm.open();
    await pair.deliver();
    await pair.gm.send(V.gmMessage);
    await pair.device.send(V.deviceMessage);
    expect(pair.toDevice).toEqual([V.gmFrame]);
    expect(pair.toGm).toEqual([V.deviceFrame]);
    await pair.deliver();
    expect([pair.deviceHeard, pair.gmHeard]).toEqual([[V.gmMessage], [V.deviceMessage]]);

    const label = (what: string): Buffer => Buffer.from(`atlas gm-screen ${GM_SCREEN_VERSION} ${what}`);
    const salt = Buffer.concat([fromBase64(V.gmOpening), fromBase64(V.deviceOpening)]);
    const seal = (direction: string, message: unknown): string => {
      const key = Buffer.from(hkdfSync('sha256', Buffer.from(V.link, 'base64url'), salt, label(direction), 32));
      const cipher = createCipheriv('aes-256-gcm', key, Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).setAAD(label(direction));
      return Buffer.concat([cipher.update(JSON.stringify(message)), cipher.final(), cipher.getAuthTag()]).toString('base64');
    };
    expect([seal('gm', V.gmMessage), seal('device', V.deviceMessage)]).toEqual([V.gmFrame.d, V.deviceFrame.d]);
  });

  it('give both ends the same check number for a knock, and another for another knock or link', async () => {
    const crypto = nodeCrypto();
    const [gm, device, other] = await Promise.all([linkKey(crypto, V.link), linkKey(nodeCrypto(), V.link), linkKey(crypto, `B${V.link.slice(1)}`)]);
    if (gm === null || device === null || other === null) throw new Error('no link key');
    for (const [knock, number] of Object.entries(V.checks)) {
      expect(await checkNumber(crypto, gm, knock)).toBe(number);
      expect(await checkNumber(crypto, device, knock)).toBe(number);
    }
    const numbers = await Promise.all(['abcdefghijklmnopqrst', 'zyxwvutsrqponmlkjihg', '22222222222222222222'].map((knock) => checkNumber(crypto, other, knock)));
    for (const number of numbers) expect(number).toMatch(/^\d{4}$/);
    expect(numbers[0]).not.toBe(V.checks.abcdefghijklmnopqrst);
  });

  it('come from new link keys that read as link keys, never twice the same, and from nothing else', async () => {
    const keys = Array.from({ length: 20 }, () => newLinkKey(nodeCrypto()));
    for (const key of keys) expect(key).toMatch(LINK_KEY_PATTERN);
    expect(new Set(keys).size).toBe(keys.length);
    for (const text of ['', 'short', `${KEY}A`, KEY.replace(/^./, '+'), KEY.slice(0, 42) + 'B']) expect(await linkKey(nodeCrypto(), text)).toBeNull();
  });
});
