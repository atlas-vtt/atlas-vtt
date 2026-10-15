// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_BATCH_SENDS, MAX_GM_FRAME, parseClientFrame } from '../../../../src/app/online/protocol/index.ts';
import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';
import { BATCH_MS, BULK_BUFFERED, SendQueue } from '../../../../src/app/online/gm/sendQueue.ts';

function clock(): Timers & { advance(ms: number): void } {
  let now = 0;
  let timers: { at: number; run: () => void; id: number }[] = [];
  let ids = 0;
  return {
    now: () => now,
    setTimer: (run, ms) => (timers.push({ at: now + ms, run, id: (ids += 1) }), ids),
    clearTimer: (id) => void (timers = timers.filter((timer) => timer.id !== id)),
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = timers.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0];
        if (next === undefined) break;
        now = next.at;
        timers = timers.filter((timer) => timer !== next);
        next.run();
      }
      now = end;
    },
  };
}

/** A game message as `TableConnection` queues it: its `send` frame and its entry. */
const message = (body: unknown, to = '*'): { readonly frame: string; readonly entry: string } => {
  const entry = JSON.stringify({ to, body });
  return { frame: JSON.stringify({ v: 1, t: 'send', to, body }), entry };
};

function batching(): { readonly queue: SendQueue; readonly sent: string[]; readonly socket: { bufferedAmount: number; send(text: string): void }; readonly time: ReturnType<typeof clock> } {
  const time = clock();
  const sent: string[] = [];
  const socket = { bufferedAmount: 0, send: (text: string) => void sent.push(text) };
  const queue = new SendQueue(time);
  queue.attach(socket, true);
  return { queue, sent, socket, time };
}

/** The game messages a frame carries, in order, as the relay reads them. */
function carried(text: string): unknown[] {
  const frame = parseClientFrame(text);
  if (frame?.t === 'sends') return frame.sends.map((send) => send.body);
  return frame?.t === 'send' ? [frame.body] : [];
}

describe('the send queue towards a relay that takes batches', () => {
  it('sends a message after a quiet spell at once, alone, and what comes within the next moment in one frame', () => {
    const { queue, sent, time } = batching();
    const first = message({ t: 'a' });
    queue.push(first.frame, '*', first.entry);
    expect(sent).toEqual([first.frame]);
    for (const t of ['b', 'c', 'd']) {
      const next = message({ t });
      queue.push(next.frame, '*', next.entry);
    }
    expect(sent).toHaveLength(1);
    time.advance(BATCH_MS);
    expect(sent).toHaveLength(2);
    expect(parseClientFrame(sent[1] ?? '')?.t).toBe('sends');
    expect(carried(sent[1] ?? '')).toEqual([{ t: 'b' }, { t: 'c' }, { t: 'd' }]);
  });

  it('puts the newest live message of each key first, and never sends faster than once a moment while messages keep coming', () => {
    const { queue, sent, time } = batching();
    for (let step = 0; step < 100; step += 1) {
      const game = message({ t: 'tokens', step });
      queue.push(game.frame, '*', game.entry);
      const marks = message({ t: 'marks', step });
      queue.pushLive('marks', marks.frame, '*', marks.entry);
      time.advance(10);
    }
    time.advance(BATCH_MS);
    expect(sent.length).toBeLessThanOrEqual(Math.ceil(1000 / BATCH_MS) + 1);
    const bodies = sent.flatMap(carried) as { t: string; step: number }[];
    // Every game message arrives, in order; of the live ones only the newest of a moment.
    expect(bodies.filter((body) => body.t === 'tokens').map((body) => body.step)).toEqual(Array.from({ length: 100 }, (_, step) => step));
    expect(bodies.filter((body) => body.t === 'marks').length).toBeLessThanOrEqual(sent.length);
    const [, second] = sent;
    expect((carried(second ?? '')[0] as { t: string }).t).toBe('marks');
  });

  it('keeps every frame within the relay\'s limits and sends a full one\'s rest at once', () => {
    const { queue, sent, time } = batching();
    const big = 'x'.repeat(Math.floor(MAX_GM_FRAME / 3));
    const lead = message({ t: 'lead' });
    queue.push(lead.frame, '*', lead.entry);
    for (let index = 0; index < 4; index += 1) {
      const next = message({ t: 'chunk', data: big });
      queue.push(next.frame, '*', next.entry);
    }
    for (let index = 0; index < MAX_BATCH_SENDS + 5; index += 1) {
      const next = message({ t: 'small', index });
      queue.push(next.frame, '*', next.entry);
    }
    // One frame after the quiet spell; a moment on, every full one makes room for the next at once.
    expect(sent).toHaveLength(1);
    time.advance(BATCH_MS);
    expect(queue.length).toBe(0);
    expect(sent.flatMap(carried)).toHaveLength(1 + 4 + MAX_BATCH_SENDS + 5);
    expect(sent.every((text) => text.length <= MAX_GM_FRAME)).toBe(true);
    expect(sent.every((text) => carried(text).length <= MAX_BATCH_SENDS)).toBe(true);
  });

  it('sends the GM\'s own requests to the relay alone, in their place', () => {
    const { queue, sent, time } = batching();
    const lead = message({ t: 'lead' });
    queue.push(lead.frame, '*', lead.entry);
    const before = message({ t: 'before' });
    queue.push(before.frame, '*', before.entry);
    queue.push('{"v":1,"t":"kick","id":"aaaaaaaaaaaaaaaaaaaa"}');
    const after = message({ t: 'after' });
    queue.push(after.frame, '*', after.entry);
    time.advance(3 * BATCH_MS);
    expect(sent.map((text) => parseClientFrame(text)?.t)).toEqual(['send', 'send', 'kick', 'send']);
  });

  it('holds what is not live while the socket drains, as without batches', () => {
    const { queue, sent, socket, time } = batching();
    socket.bufferedAmount = BULK_BUFFERED + 1;
    const chunk = message({ t: 'chunk' });
    queue.push(chunk.frame, '*', chunk.entry);
    const marks = message({ t: 'marks' });
    queue.pushLive('marks', marks.frame, '*', marks.entry);
    time.advance(BATCH_MS);
    expect(sent.flatMap(carried)).toEqual([{ t: 'marks' }]);
    socket.bufferedAmount = 0;
    time.advance(BATCH_MS);
    expect(sent.flatMap(carried)).toEqual([{ t: 'marks' }, { t: 'chunk' }]);
  });
});
