import { CURSOR_REST_MS, GM_MARKS, MARKS_INTERVAL_MS, type PlayerCursor } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { checkCursor, MARKS_PER_SECOND } from '../../../../src/app/online/gm/markCheck.ts';
import { lastMarks, markHarness, type MarkHarness } from './markHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = { width: 1000, height: 800 };
const cursor = (changes: Partial<PlayerCursor> = {}): PlayerCursor => ({ t: 'cursor', scene: 's1', at: [100, 100], pts: [90, 100, 100, 100], ...changes });

/** A harness on scene s1 with everyone's cursors shown. */
function shown(): MarkHarness {
  const harness = markHarness(MAP);
  harness.cursorsOn = true;
  harness.share.setScene('s1');
  return harness;
}

describe('checking a player\'s cursor', () => {
  it('refuses another scene and leaves out places far off the map', () => {
    expect(checkCursor(cursor({ scene: 's2' }), { scene: 's1', map: MAP })).toBeNull();
    expect(checkCursor(cursor(), { scene: null, map: MAP })).toBeNull();
    expect(checkCursor(cursor({ at: [5000, 0], pts: [1, 2, 9000, 2], span: 33 }), { scene: 's1', map: MAP })).toEqual({ at: null, pts: [1, 2], span: 33 });
  });
});

describe('everyone\'s cursors', () => {
  it('go out with the marks while the GM lets everyone see them, each player\'s with their name and what it passed', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor({ span: 33 }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toEqual([{ who: ANA, name: 'Ana', at: [100, 100], pts: [90, 100, 100, 100], span: 33 }]);
    harness.cursor.moveTo([300, 200], harness.now());
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toEqual([{ who: GM_MARKS, at: [300, 200], pts: [300, 200] }, { who: ANA, name: 'Ana', at: [100, 100], pts: [] }]);
  });

  it('are neither taken nor sent while the setting is off, and go once it is switched off', () => {
    const harness = markHarness(MAP);
    harness.share.setScene('s1');
    harness.share.receive(ANA, cursor());
    harness.cursor.moveTo([300, 200], harness.now());
    harness.advance(MARKS_INTERVAL_MS);
    expect(harness.sent.every(({ body }) => body.cursors === undefined)).toBe(true);
    expect(harness.cursorShows.every((cursors) => cursors.length === 0)).toBe(true);

    harness.cursorsOn = true;
    harness.share.receive(ANA, cursor());
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toHaveLength(2);
    harness.cursorsOn = false;
    harness.share.update();
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)).not.toHaveProperty('cursors');
    expect(harness.cursorShows.at(-1)).toEqual([]);
  });

  it('show the GM a player\'s cursor as it arrives, with only that message\'s places', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor({ span: 20 }));
    harness.share.receive(BEN, cursor({ at: [50, 50], pts: [50, 50] }));
    expect(harness.cursorShows.at(-1)).toEqual([
      { who: ANA, name: 'Ana', at: [100, 100], pts: [] },
      { who: BEN, name: 'Ben', at: [50, 50], pts: [50, 50] },
    ]);
  });

  it('leave out a cursor whose owner did nothing for long until they do again, and tell the GM\'s overlay', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor());
    harness.advance(CURSOR_REST_MS - 1);
    // A page sends only while its owner is at work: the same place again (a scroll, a zoom) keeps the cursor.
    harness.share.receive(ANA, cursor({ pts: [] }));
    harness.advance(CURSOR_REST_MS - 1);
    harness.share.update();
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toHaveLength(1);
    harness.advance(2);
    harness.share.update();
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toEqual([]);
    expect(harness.cursorShows.at(-1)).toEqual([]);
    harness.share.receive(ANA, cursor({ at: [120, 100], pts: [120, 100] }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors?.map(({ who }) => who)).toEqual([ANA]);
  });

  it('go out now and then while they show and nothing changes, so pages can tell a GM that went silent', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor());
    harness.advance(MARKS_INTERVAL_MS);
    const before = harness.sent.length;
    for (let second = 0; second < 4; second += 1) {
      harness.advance(1000);
      harness.share.update();
    }
    harness.advance(MARKS_INTERVAL_MS);
    const again = harness.sent.slice(before);
    expect(again.length).toBeGreaterThanOrEqual(1);
    expect(again.length).toBeLessThanOrEqual(2);
    expect(again.every(({ body }) => body.cursors?.every(({ pts }) => pts.length === 0))).toBe(true);
  });

  it('give way to their owner\'s laser while it shows its pointer', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor());
    harness.share.receive(ANA, { t: 'laser', scene: 's1', color: '#66ffa9', size: 16, at: [100, 100], pts: [], on: false });
    harness.cursor.moveTo([300, 200], harness.now());
    harness.laser.at = [300, 200];
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toEqual([]);
    harness.laser.at = null;
    harness.cursor.moveTo([310, 200], harness.now());
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors?.map(({ who }) => who)).toEqual([GM_MARKS]);
  });

  it('leave a cursor out once it left the map, and with its player once they leave', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor());
    harness.share.receive(BEN, cursor());
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toHaveLength(2);
    harness.share.receive(ANA, cursor({ at: null, pts: [] }));
    harness.share.playerLeft(BEN);
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toEqual([]);
    expect(harness.cursorShows.at(-1)).toEqual([]);
  });

  it('take no more of a player\'s cursor a second than of a laser, and none for another scene', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor({ scene: 's2' }));
    for (let index = 0; index < MARKS_PER_SECOND * 3; index += 1) harness.share.receive(ANA, cursor({ at: [index, 0], pts: [] }));
    harness.advance(MARKS_INTERVAL_MS);
    const at = lastMarks(harness)?.cursors?.[0]?.at;
    expect(at?.[0]).toBeLessThan(MARKS_PER_SECOND * 3);
    expect(at?.[0]).toBeGreaterThan(0);
  });

  it('go out once more as they leave the map, with the way they took to the edge', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor());
    harness.cursor.moveTo([300, 200], harness.now());
    harness.advance(MARKS_INTERVAL_MS);
    harness.share.receive(ANA, cursor({ at: null, pts: [990, 100], span: 16 }));
    expect(harness.cursorShows.at(-1)).toEqual([{ who: ANA, name: 'Ana', at: null, pts: [990, 100], span: 16 }]);
    harness.cursor.moveTo([310, 200], harness.now());
    harness.cursor.moveTo(null, harness.now());
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toEqual([{ who: GM_MARKS, at: null, pts: [310, 200] }, { who: ANA, name: 'Ana', at: null, pts: [990, 100], span: 16 }]);
    harness.advance(MARKS_INTERVAL_MS);
    harness.share.update();
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.cursors).toEqual([]);
  });

  it('show the GM\'s overlay the cursors again at every look, which a held tab may have cleared', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor());
    const before = harness.cursorShows.length;
    harness.share.update();
    expect(harness.cursorShows.length).toBe(before + 1);
    expect(harness.cursorShows.at(-1)?.map(({ who }) => who)).toEqual([ANA]);
  });

  it('start anew with another scene', () => {
    const harness = shown();
    harness.share.receive(ANA, cursor());
    harness.share.setScene('s2');
    harness.advance(MARKS_INTERVAL_MS);
    expect(harness.cursorShows.at(-1)).toEqual([]);
    expect(harness.sent.filter(({ body }) => body.scene === 's2' && (body.cursors?.length ?? 0) > 0)).toEqual([]);
  });
});
