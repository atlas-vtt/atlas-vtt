import { describe, expect, it } from 'vitest';
import { ALL_PLAYERS, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { AssetProgress, PROGRESS_HEARTBEAT_MS, PROGRESS_INTERVAL_MS } from '../../../../src/app/online/gm/assets/assetProgress.ts';
import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';

const ID_A = 'a'.repeat(64);
const ID_B = 'b'.repeat(64);

/** A clock whose timers fire when it is moved on. */
function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => now,
    setTimer: (run, ms) => {
      const id = next++;
      due.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer: (id) => void due.delete(id),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const soonest = [...due].sort(([, a], [, b]) => a.at - b.at)[0];
        if (!soonest || soonest[1].at > until) break;
        now = soonest[1].at;
        due.delete(soonest[0]);
        soonest[1].run();
      }
      now = until;
    },
  };
}

function harness(connected: string[] = ['p1', 'p2']) {
  const timers = fakeTimers();
  const out: { body: GmMessage; to: string | undefined; live: boolean }[] = [];
  const progress = new AssetProgress({
    send: (body, to) => out.push({ body, to, live: false }),
    sendLive: (body, _key, to) => out.push({ body, to, live: true }),
    connected: () => connected,
    timers,
  });
  const sharesSent = (to: string): Record<string, number>[] => out.filter((m) => m.to === to && m.body.t === 'asset-progress').map((m) => (m.body as { shares: Record<string, number> }).shares);
  return { timers, out, progress, sharesSent };
}

describe('a player handed a stored asset later hears of it at once', () => {
  it('tells the player the share of an id they are handed for the first time, even one that reached 1 long ago', () => {
    const { timers, progress, sharesSent } = harness();
    progress.set(ID_A, 1);
    timers.advance(60_000);
    progress.sent(`{"t":"scene","scene":{"map":{"id":"${ID_A}"}}}`, 'p1');
    expect(sharesSent('p1')).toEqual([{ [ID_A]: 1 }]);
    expect(sharesSent('p2')).toEqual([]);
  });

  it('tells it once: a second message naming the same id to the same player sends nothing', () => {
    const { progress, sharesSent } = harness();
    progress.set(ID_A, 1);
    progress.sent(`{"id":"${ID_A}"}`, 'p1');
    progress.sent(`{"id":"${ID_A}"}`, 'p1');
    expect(sharesSent('p1')).toHaveLength(1);
  });

  it('tells everyone connected their own when the message went to all', () => {
    const { progress, sharesSent } = harness();
    progress.set(ID_A, 1);
    progress.set(ID_B, 0.5);
    progress.sent(`{"id":"${ID_A}"},{"id":"${ID_B}"}`, ALL_PLAYERS);
    expect(sharesSent('p1')).toEqual([{ [ID_A]: 1, [ID_B]: 0.5 }]);
    expect(sharesSent('p2')).toEqual([{ [ID_A]: 1, [ID_B]: 0.5 }]);
  });

  it('names nothing for ids the GM knows no share of', () => {
    const { progress, out } = harness();
    progress.sent(`{"id":"${ID_A}"}`, 'p1');
    expect(out).toEqual([]);
  });
});

describe('while an upload stands still, players still hear of it', () => {
  it('repeats an unchanged share every heartbeat until it reaches 1', () => {
    const { timers, progress, sharesSent } = harness(['p1']);
    progress.set(ID_A, 0.2);
    progress.sent(`{"id":"${ID_A}"}`, 'p1');
    timers.advance(PROGRESS_INTERVAL_MS);
    const first = sharesSent('p1').length;
    timers.advance(PROGRESS_HEARTBEAT_MS * 3 + 10);
    expect(sharesSent('p1').length).toBeGreaterThanOrEqual(first + 3);
    progress.set(ID_A, 1);
    timers.advance(PROGRESS_INTERVAL_MS);
    const done = sharesSent('p1').length;
    timers.advance(PROGRESS_HEARTBEAT_MS * 3);
    expect(sharesSent('p1').length).toBe(done);
  });

  it('stops its heartbeat with the rest', () => {
    const { timers, progress, sharesSent } = harness(['p1']);
    progress.set(ID_A, 0.2);
    progress.sent(`{"id":"${ID_A}"}`, 'p1');
    timers.advance(PROGRESS_INTERVAL_MS);
    const before = sharesSent('p1').length;
    progress.stop();
    timers.advance(PROGRESS_HEARTBEAT_MS * 3);
    expect(sharesSent('p1').length).toBe(before);
  });
});
