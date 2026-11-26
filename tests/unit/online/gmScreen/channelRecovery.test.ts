import { describe, expect, it } from 'vitest';
import { newLinkKey } from '../../../../src/app/online/gmScreen/channel/index.ts';
import { GM_SCREEN_VERSION, type DeviceMessage, type GmScreenMessage, type SealedFrame } from '../../../../src/app/online/protocol/index.ts';
import { channelPair, nodeCrypto, type ChannelPair } from './channelPair';

const KEY = newLinkKey(nodeCrypto());
const press = (id: number): DeviceMessage => ({ t: 'press', id, command: { type: 'stopAll' } });
const code = (code: string): GmScreenMessage => ({ t: 'your-code', code, first: false });
const ASK = { t: 'seal-ask', v: GM_SCREEN_VERSION } as const;
const HOUR = 60 * 60_000;

async function openPair(): Promise<ChannelPair> {
  const pair = await channelPair(KEY);
  await pair.gm.open();
  await pair.deliver();
  return pair;
}

/** The openings Atlas sent, as the relay saw them. */
const openings = (pair: ChannelPair): string[] => pair.wire.filter((text) => text.includes('"seal-open"'));
const asks = (pair: ChannelPair): number => pair.wire.filter((text) => text.includes('"seal-ask"')).length;

/** Lets `ms` pass on Atlas's clock and what that started run, delivering nothing. */
async function pass(pair: ChannelPair, ms: number): Promise<void> {
  pair.timers.advance(ms);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The device saw frames go missing and asked; Atlas began a new exchange, whose opening the room drops. */
async function lostOpeningAfterAsk(pair: ChannelPair): Promise<void> {
  await pair.gm.send(code('111111'));
  await pair.gm.send(code('222222'));
  pair.toDevice.shift();
  await pair.device.receive(pair.toDevice.shift());
  await pair.gm.receive(pair.toGm.shift());
  expect(pair.toDevice.shift()).toMatchObject({ t: 'seal-open' });
}

describe('a GM screen channel whose opening exchange loses a frame', () => {
  it('opens once the answer Atlas never heard goes again: Atlas sends the same opening, the device repeats its answer, and both say their state again', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    await pair.device.receive(pair.toDevice.shift());
    const [answer] = pair.toGm.splice(0);
    expect([pair.device.isOpen, pair.gm.isOpen]).toEqual([true, false]);
    // What the device sealed meanwhile opens nowhere, and draws no new exchange while the opening may still go again.
    await pair.device.send(press(1));
    await pair.gm.receive(ASK);
    await pair.deliver();
    expect(openings(pair)).toHaveLength(1);
    await pair.elapse(1000);
    const [first, again] = openings(pair);
    expect(again).toBe(first);
    expect(pair.wire.filter((text) => text.includes('"seal-answer"'))).toEqual([JSON.stringify(answer), JSON.stringify(answer)]);
    expect(pair.opened).toEqual({ gm: 1, device: 2 });
    expect(await pair.device.send(press(2))).toBe(true);
    expect(await pair.gm.send(code('333333'))).toBe(true);
    await pair.deliver();
    expect([pair.gmHeard, pair.deviceHeard]).toEqual([[press(2)], [code('333333')]]);
  });

  it('opens once an opening the room dropped after the device asked goes again; what the device sealed meanwhile is heard', async () => {
    const pair = await openPair();
    await lostOpeningAfterAsk(pair);
    for (let id = 1; id <= 3; id += 1) expect(await pair.device.send(press(id))).toBe(true);
    await pair.deliver();
    expect(pair.gmHeard).toEqual([press(1), press(2), press(3)]);
    expect(await pair.gm.send(code('333333'))).toBe(false);
    await pair.elapse(1000);
    expect([pair.gm.isOpen, pair.device.isOpen, pair.opened]).toEqual([true, true, { gm: 2, device: 2 }]);
    expect(await pair.gm.send(code('333333'))).toBe(true);
    await pair.deliver();
    expect(pair.deviceHeard.at(-1)).toEqual(code('333333'));
  });

  it('opens when both frames of an exchange are lost: the opening, then the answer to it once it went again', async () => {
    const pair = await openPair();
    await lostOpeningAfterAsk(pair);
    await pass(pair, 1000);
    await pair.device.receive(pair.toDevice.shift());
    // The room drops the device's answer to the opening that went again.
    expect(pair.toGm.splice(0)).toMatchObject([{ t: 'seal-answer' }]);
    expect([pair.gm.isOpen, pair.device.isOpen]).toEqual([false, true]);
    await pair.elapse(2000);
    expect([pair.gm.isOpen, pair.device.isOpen]).toEqual([true, true]);
    await pair.gm.send(code('444444'));
    await pair.device.send(press(4));
    await pair.deliver();
    expect([pair.gmHeard.at(-1), pair.deviceHeard.at(-1)]).toEqual([press(4), code('444444')]);
  });

  it('opens anew when the device is heard after every send of an opening was lost, so what it pressed is answered', async () => {
    const pair = await openPair();
    // Atlas opens again (a welcome after its own reconnect); the room drops all five sends of that opening.
    await pair.gm.open();
    for (let at = 0; at < 2 * 60_000; at += 20_000) {
      pair.toDevice.splice(0);
      await pass(pair, 20_000);
    }
    pair.toDevice.splice(0);
    expect(openings(pair)).toHaveLength(6);
    // The device saw none of it, and presses a key under the keys it holds.
    expect(await pair.device.send(press(1))).toBe(true);
    await pair.deliver();
    expect(pair.gmHeard).toEqual([press(1)]);
    expect([pair.gm.isOpen, pair.device.isOpen]).toEqual([true, true]);
    expect(await pair.gm.send(code('111111'))).toBe(true);
    await pair.deliver();
    expect(pair.deviceHeard).toEqual([code('111111')]);
  });

  it('sends a lost opening again within seconds however often the device came back before: an answered exchange is no trouble', async () => {
    const pair = await openPair();
    for (let back = 0; back < 10; back += 1) {
      await pass(pair, 45_000);
      await pair.gm.open();
      await pair.deliver();
      expect(pair.gm.isOpen).toBe(true);
    }
    await pass(pair, 45_000);
    await pair.gm.open();
    pair.toDevice.splice(0);
    const sent = openings(pair).length;
    await pass(pair, 1000);
    expect(openings(pair)).toHaveLength(sent + 1);
    await pair.deliver();
    expect(pair.gm.isOpen).toBe(true);
  });

  it('brings no earlier keys back for handshake frames the room replays during the recovery', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    const [oldOpening] = pair.toDevice;
    await pair.deliver();
    const [oldAnswer] = pair.wire.filter((text) => text.includes('"seal-answer"')).map((text) => JSON.parse(text) as unknown);
    await pair.gm.send(code('111111'));
    const oldFrame = pair.toDevice.shift() as SealedFrame;
    await lostOpeningAfterAsk(pair);
    // The room replays the earlier exchange's answer to Atlas and its opening to the device.
    await pair.gm.receive(oldAnswer);
    expect(pair.gm.isOpen).toBe(false);
    await pair.device.receive(oldOpening);
    await pair.deliver();
    expect(pair.gm.isOpen).toBe(false);
    await pair.elapse(1000);
    expect([pair.gm.isOpen, pair.device.isOpen]).toEqual([true, true]);
    const heard = pair.deviceHeard.length;
    await pair.device.receive(oldFrame);
    expect(pair.deviceHeard).toHaveLength(heard);
    await pair.gm.send(code('555555'));
    await pair.device.send(press(5));
    await pair.deliver();
    expect([pair.gmHeard.at(-1), pair.deviceHeard.at(-1)]).toEqual([press(5), code('555555')]);
  });
});

describe('a GM screen channel the room replays frames into', () => {
  it('opens nothing sealed under an earlier exchange at either end once a later one finished, and finds its way back', async () => {
    const pair = await openPair();
    const [firstOpening, firstAnswer] = pair.wire.map((text) => JSON.parse(text) as unknown);
    await pair.gm.send(code('111111'));
    await pair.device.send(press(1));
    const [oldDown, oldUp] = [pair.toDevice.at(-1), pair.toGm.at(-1)];
    await pair.deliver();
    await pair.gm.open();
    await pair.deliver();
    expect([pair.gm.isOpen, pair.device.isOpen]).toEqual([true, true]);
    const heard = [pair.gmHeard.length, pair.deviceHeard.length];
    for (let again = 0; again < 3; again += 1) {
      await pair.gm.receive(firstAnswer);
      await pair.gm.receive(oldUp);
      await pair.device.receive(oldDown);
      await pair.device.receive(firstOpening);
      await pair.device.receive(oldDown);
    }
    expect([pair.gmHeard.length, pair.deviceHeard.length]).toEqual(heard);
    for (let step = 0; step < 40; step += 1) await pair.elapse(5000);
    expect(await pair.gm.send(code('222222'))).toBe(true);
    expect(await pair.device.send(press(2))).toBe(true);
    await pair.deliver();
    expect([pair.gmHeard.at(-1), pair.deviceHeard.at(-1)]).toEqual([press(2), code('222222')]);
  });

  it('answers the same opening replayed to a device with the same answer each time, never with new keys', async () => {
    const pair = await openPair();
    const [opening] = pair.wire.map((text) => JSON.parse(text) as unknown);
    const before = pair.toGm.length;
    for (let again = 0; again < 50; again += 1) await pair.device.receive(opening);
    const answers = pair.toGm.splice(before);
    expect(answers).toHaveLength(50);
    expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
    expect(await pair.gm.send(code('333333'))).toBe(true);
    await pair.deliver();
    expect(pair.deviceHeard.at(-1)).toEqual(code('333333'));
  });
});

describe('what a channel sends to an end that never answers', () => {
  it('sends one opening five times to a device that stays silent, then nothing for an hour', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    for (let at = 0; at < HOUR; at += 10_000) await pass(pair, 10_000);
    expect(new Set(openings(pair)).size).toBe(1);
    expect(openings(pair)).toHaveLength(5);
  });

  it('sends a device that keeps asking or sealing what does not open no more than an opening a minute', async () => {
    const pair = await channelPair(KEY);
    await pair.gm.open();
    const garbage = { t: 'sealed', n: 1, d: 'A'.repeat(24) } as const;
    let firstHalf = 0;
    for (let at = 0; at < HOUR; at += 5000) {
      if (at === HOUR / 2) firstHalf = openings(pair).length;
      await pair.gm.receive(at % 10_000 === 0 ? ASK : garbage);
      await pass(pair, 5000);
    }
    expect(openings(pair).length).toBeLessThanOrEqual(70);
    expect(openings(pair).length - firstHalf).toBeLessThanOrEqual(31);
  });

  it('sends a device heard under earlier keys no more than an opening a minute while every opening is lost', async () => {
    const pair = await openPair();
    await pair.gm.open();
    let firstHalf = 0;
    for (let at = 0; at < HOUR; at += 5000) {
      if (at === HOUR / 2) firstHalf = openings(pair).length;
      pair.toDevice.splice(0);
      await pair.device.send(press(at));
      await pair.gm.receive(pair.toGm.shift());
      await pass(pair, 5000);
    }
    expect(pair.gmHeard).toHaveLength(HOUR / 5000);
    expect(openings(pair).length).toBeLessThanOrEqual(70);
    expect(openings(pair).length - firstHalf).toBeLessThanOrEqual(31);
  });

  it('sends a device that answers every opening at once but keeps asking and sealing what does not open no more than about an opening a minute', { timeout: 60_000 }, async () => {
    const pair = await openPair();
    const start = openings(pair).length;
    const garbage = { t: 'sealed', n: 5, d: 'A'.repeat(40) } as const;
    for (let at = 0; at < HOUR; at += 1000) {
      for (let call = 0; call < 2; call += 1) {
        await pair.gm.receive(ASK);
        await pair.gm.receive(garbage);
      }
      await pair.deliver();
      await pass(pair, 1000);
    }
    expect(openings(pair).length - start).toBeLessThanOrEqual(70);
  });

  it('asks Atlas a few times however many of its frames do not open: at the first, the fourth, the sixteenth', async () => {
    const pair = await openPair();
    const other = await channelPair(newLinkKey(nodeCrypto()));
    await other.gm.open();
    await other.deliver();
    for (let id = 0; id < 100; id += 1) await other.gm.send(code('666666'));
    const strangers = other.toDevice.splice(0).filter((body): body is SealedFrame => body.t === 'sealed');
    const before = asks(pair);
    for (const frame of strangers) await pair.device.receive(frame);
    expect(asks(pair) - before).toBe(4);
    expect(pair.toGm).toEqual([ASK, ASK, ASK, ASK]);
  });
});
