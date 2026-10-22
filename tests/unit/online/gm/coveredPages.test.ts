import { describe, expect, it } from 'vitest';
import { parsePlayerMessage, type GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { CATCH_UP_MS, CoveredPages } from '../../../../src/app/online/gm/coveredPages.ts';

const ANA = 'anaanaanaanaanaanaan';
const BEN = 'benbenbenbenbenbenbe';
const MARKS: GmMessage = { t: 'marks', scene: 's', lasers: [], measures: [] };
const DRAG: GmMessage = { t: 'live', scene: 's', at: 1, tokens: [{ id: 'a'.repeat(24), x: 1, y: 2 }] };
const COVER = { t: 'book-cover', covered: true };
const UNCOVER = { t: 'book-cover', covered: false };

interface Pages {
  readonly covers: CoveredPages;
  readonly sent: { body: GmMessage; to: string }[];
  readonly caughtUp: string[];
  advance(ms: number): void;
}

function pages(batches = true): Pages {
  const sent: { body: GmMessage; to: string }[] = [];
  const caughtUp: string[] = [];
  let now = 0;
  let ids = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const covers = new CoveredPages({
    sendLive: (body, _key, to = '*') => void sent.push({ body, to }),
    batches: () => batches,
    connected: () => [ANA, BEN],
    uncovered: (player) => void caughtUp.push(player),
    now: () => now,
    setTimer: (run, ms) => (timers.set((ids += 1), { at: now + ms, run }), ids),
    clearTimer: (timer) => void timers.delete(timer),
  });
  const advance = (ms: number): void => {
    const end = now + ms;
    for (const [id, timer] of [...timers].sort(([, a], [, b]) => a.at - b.at)) {
      if (timer.at > end) continue;
      timers.delete(id);
      now = timer.at;
      timer.run();
    }
    now = end;
  };
  return { covers, sent, caughtUp, advance };
}

describe('pages whose book covers their map', () => {
  it('reads the cover message, and the GM\'s parser reads it too', () => {
    expect(parsePlayerMessage(COVER)).toEqual(COVER);
    expect(parsePlayerMessage({ t: 'book-cover', covered: 'yes' })).toBeNull();
    expect(pages().covers.receive(ANA, { t: 'book-parts' })).toBe(false);
  });

  it('leaves a covered page out of the marks only: drags and everything else still reach it', () => {
    const { covers, sent } = pages();
    covers.sendLive(MARKS, 'marks');
    expect(covers.receive(ANA, COVER)).toBe(true);
    covers.sendLive(MARKS, 'marks');
    covers.sendLive(DRAG, 's');
    covers.sendLive(MARKS, 'marks', ANA);
    expect(sent).toEqual([{ body: MARKS, to: '*' }, { body: MARKS, to: BEN }, { body: DRAG, to: '*' }, { body: MARKS, to: ANA }]);
  });

  it('catches an uncovered page up once a second at most, however often it flicks between screens', () => {
    const { covers, caughtUp, advance } = pages();
    for (let flick = 0; flick < 20; flick += 1) {
      covers.receive(ANA, COVER);
      covers.receive(ANA, UNCOVER);
      advance(50);
    }
    // One at once, one when a second has passed, and none after the page stopped.
    expect(caughtUp).toEqual([ANA, ANA]);
    advance(5 * CATCH_UP_MS);
    expect(caughtUp).toEqual([ANA, ANA]);
  });

  it('waits a catch-up for a page that is covered again meanwhile until it is uncovered', () => {
    const { covers, caughtUp, advance } = pages();
    covers.receive(ANA, COVER);
    covers.receive(ANA, UNCOVER);
    covers.receive(ANA, COVER);
    covers.receive(ANA, UNCOVER);
    covers.receive(ANA, COVER);
    advance(CATCH_UP_MS);
    expect(caughtUp).toEqual([ANA]);
    covers.receive(ANA, UNCOVER);
    expect(caughtUp).toEqual([ANA, ANA]);
  });

  it('lets no catch-up outlive a reset, as when the table ends', () => {
    const { covers, caughtUp, advance } = pages();
    covers.receive(ANA, COVER);
    covers.receive(ANA, UNCOVER);
    covers.receive(ANA, COVER);
    covers.receive(ANA, UNCOVER);
    expect(caughtUp).toEqual([ANA]);
    covers.reset();
    advance(5 * CATCH_UP_MS);
    expect(caughtUp).toEqual([ANA]);
  });

  it('keeps no covers where the relay takes no batches: every page gets every marks message, and none needs catching up', () => {
    const { covers, sent, caughtUp } = pages(false);
    expect(covers.receive(ANA, COVER)).toBe(true);
    covers.sendLive(MARKS, 'marks');
    expect(covers.receive(ANA, UNCOVER)).toBe(true);
    expect(sent).toEqual([{ body: MARKS, to: '*' }]);
    expect(caughtUp).toEqual([]);
  });

  it('takes no page as covered after the GM reached the relay anew, or after the page left, or where the relay takes no batches', () => {
    const reset = pages();
    reset.covers.receive(ANA, COVER);
    reset.covers.reset();
    reset.covers.sendLive(MARKS, 'marks');
    expect(reset.sent).toEqual([{ body: MARKS, to: '*' }]);
    const left = pages();
    left.covers.receive(ANA, COVER);
    left.covers.playerLeft(ANA);
    left.covers.sendLive(MARKS, 'marks');
    expect(left.sent).toEqual([{ body: MARKS, to: '*' }]);
    const unbatched = pages(false);
    unbatched.covers.receive(ANA, COVER);
    unbatched.covers.sendLive(MARKS, 'marks');
    expect(unbatched.sent).toEqual([{ body: MARKS, to: '*' }]);
  });
});
