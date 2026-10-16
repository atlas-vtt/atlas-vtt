// @vitest-environment node
import { MARKS_INTERVAL_MS, MAX_LASER_SPAN_MS, type PlayerLaser, type PlayerMeasure } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { checkLaser, checkMeasure, MARKS_PER_SECOND, nearMap, swatchColour } from '../../../../src/app/online/gm/markCheck.ts';
import { LASER_SILENCE_MS } from '../../../../src/app/online/gm/MarkShare.ts';
import { lastMarks, markHarness } from './markHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = { width: 1000, height: 800 };
const CONTEXT = { scene: 's1', map: MAP };
const laser = (changes: Partial<PlayerLaser> = {}): PlayerLaser => ({ t: 'laser', scene: 's1', color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true, ...changes });
const measure = (changes: Partial<PlayerMeasure> = {}): PlayerMeasure => ({ t: 'measure', scene: 's1', color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [], ...changes });

describe('checking players\' marks', () => {
  it('takes only the swatches\' colours, as the swatch writes them', () => {
    expect(swatchColour('#66FFA9')).toBe('#66ffa9');
    expect(swatchColour('#66ffaa')).toBeNull();
    expect(checkLaser(laser({ color: '#123456' }), CONTEXT)).toBeNull();
    expect(checkMeasure(measure({ color: '#123456' }), CONTEXT)).toBeNull();
    expect(checkLaser(laser({ color: '#FF9F2E' }), CONTEXT)?.color).toBe('#ff9f2e');
  });

  it('clamps the laser\'s size as Atlas does', () => {
    expect(checkLaser(laser({ size: 1 }), CONTEXT)?.size).toBe(8);
    expect(checkLaser(laser({ size: 900 }), CONTEXT)?.size).toBe(100);
  });

  it('refuses another scene, or none shared', () => {
    expect(checkLaser(laser({ scene: 's2' }), CONTEXT)).toBeNull();
    expect(checkMeasure(measure({ scene: 's2' }), CONTEXT)).toBeNull();
    expect(checkLaser(laser(), { scene: null, map: MAP })).toBeNull();
  });

  it('leaves out points far off the map and any that are not numbers', () => {
    expect(nearMap([Number.NaN, 0], MAP)).toBe(false);
    expect(nearMap([Number.POSITIVE_INFINITY, 0], null)).toBe(false);
    expect(nearMap([-900, 1500], MAP)).toBe(true);
    expect(nearMap([-1100, 0], MAP)).toBe(false);
    expect(checkLaser(laser({ at: [5000, 0], pts: [1, 2, 9000, 2, 3, 4] }), CONTEXT)).toEqual({ color: '#66ffa9', size: 16, at: null, pts: [1, 2, 3, 4], on: true });
    expect(checkLaser(laser({ span: 33 }), CONTEXT)?.span).toBe(33);
    const far = { shape: 'circle', a: [0, 0], b: [0, 9000] } as const;
    expect(checkMeasure(measure({ live: far, kept: [far, { shape: 'cone', a: [1, 1], b: [2, 2] }] }), CONTEXT)).toEqual({ color: '#66ffa9', live: null, kept: [{ shape: 'cone', a: [1, 1], b: [2, 2] }] });
  });
});

describe('MarkShare', () => {
  it('passes each player\'s laser and measurements on to all, the GM\'s too, and draws the players\' for the GM', async () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser());
    harness.share.receive(BEN, measure());
    harness.advance(MARKS_INTERVAL_MS);
    harness.laser.at = [5, 5];
    harness.laser.changed();
    await harness.measure({ live: { shape: 'sphere', start: { x: 1, y: 1 }, end: { x: 3, y: 4 } }, kept: [] });
    harness.advance(MARKS_INTERVAL_MS);
    const marks = lastMarks(harness);
    expect(harness.sent.every(({ to }) => to === undefined)).toBe(true);
    expect(marks?.lasers.map((entry) => entry.who)).toEqual(['gm', ANA]);
    expect(marks?.lasers[0]).toMatchObject({ who: 'gm', color: '#ff0059', at: [5, 5], on: false });
    expect(marks?.measures).toEqual([
      { who: 'gm', color: '#123456', live: { shape: 'circle', a: [1, 1], b: [3, 4] }, kept: [] },
      { who: BEN, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [] },
    ]);
    expect(harness.shown?.lasers.map((entry) => entry.who)).toEqual([ANA]);
    expect(harness.shown?.measures.map((entry) => entry.who)).toEqual([BEN]);
  });

  it('sends trail points once and nothing while nothing changes', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser());
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers[0]?.pts).toEqual([100, 100, 110, 100]);
    const count = harness.sent.length;
    harness.share.receive(ANA, laser({ pts: [] }));
    harness.share.update();
    harness.advance(5 * MARKS_INTERVAL_MS);
    expect(harness.sent.length).toBe(count + 1);
    expect(lastMarks(harness)?.lasers[0]?.pts).toEqual([]);
    harness.share.update();
    harness.advance(5 * MARKS_INTERVAL_MS);
    expect(harness.sent.length).toBe(count + 1);
  });

  it('sends at most one marks message every interval, however much arrives', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    const players = Array.from({ length: 6 }, (_, index) => String.fromCharCode(97 + index).repeat(20));
    for (let ms = 0; ms < 3000; ms += 4) {
      for (const player of players) harness.share.receive(player, laser({ at: [ms % 500, 10], pts: [ms % 500, 10] }));
      harness.laser.at = [ms % 700, 20];
      harness.laser.changed();
      harness.advance(4);
    }
    expect(harness.sent.length).toBeGreaterThanOrEqual(Math.floor(3000 / MARKS_INTERVAL_MS) - 1);
    expect(harness.sent.length).toBeLessThanOrEqual(Math.floor(3000 / MARKS_INTERVAL_MS) + 1);
  });

  it(`drops a player's marks above ${MARKS_PER_SECOND} a second, and takes what a client sends: one every interval`, () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    const before = harness.shows.length;
    for (let index = 0; index < 2 * MARKS_PER_SECOND; index += 1) harness.share.receive(ANA, laser({ pts: [index, index] }));
    expect(harness.shows.length - before).toBe(MARKS_PER_SECOND);
    harness.advance(2000);
    const steady = harness.shows.length;
    for (let sent = 0; sent < 300; sent += 1) {
      harness.share.receive(BEN, laser({ at: [sent, 10], pts: [sent, 10] }));
      harness.share.receive(BEN, measure({ live: { shape: 'line', a: [10, 10], b: [sent, 10] } }));
      harness.advance(MARKS_INTERVAL_MS);
    }
    expect(harness.shows.length - steady).toBe(600);
  });

  it('draws a player\'s laser and measurements for the GM as they arrive, not at the pace marks are sent on', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(BEN, laser({ at: [7, 7], pts: [] }));
    harness.advance(1);
    const sent = harness.sent.length;
    harness.share.receive(ANA, laser({ pts: [100, 100, 110, 100], span: 20 }));
    expect(harness.shown?.lasers).toEqual([
      { who: BEN, color: '#66ffa9', size: 16, at: [7, 7], pts: [], on: true },
      { who: ANA, color: '#66ffa9', size: 16, at: [100, 100], pts: [100, 100, 110, 100], on: true, span: 20 },
    ]);
    harness.advance(5);
    harness.share.receive(ANA, laser({ at: [130, 100], pts: [120, 100, 130, 100], span: 5 }));
    // Only what is new: the overlay adds each update's points to the trail.
    expect(harness.shown?.lasers[1]).toEqual({ who: ANA, color: '#66ffa9', size: 16, at: [130, 100], pts: [120, 100, 130, 100], on: true, span: 5 });
    harness.share.receive(BEN, measure());
    expect(harness.shown?.lasers.map((entry) => entry.pts)).toEqual([[], []]);
    expect(harness.shown?.measures).toEqual([{ who: BEN, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [] }]);
    expect(harness.sent.length).toBe(sent);
    harness.share.playerLeft(BEN);
    expect(harness.shown?.lasers.map((entry) => entry.who)).toEqual([ANA]);
    expect(harness.shown?.measures).toEqual([]);
    const shows = harness.shows.length;
    harness.advance(10 * MARKS_INTERVAL_MS);
    expect(harness.shows.length).toBe(shows);
  });

  it('sends each laser on with the time its points cover: a player\'s messages added up, the GM\'s as its laser tells it', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser({ pts: [1, 1], span: 400 }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers).toEqual([{ who: ANA, color: '#66ffa9', size: 16, at: [100, 100], pts: [1, 1], on: true, span: 400 }]);
    harness.advance(10);
    harness.share.receive(ANA, laser({ pts: [2, 2, 3, 3], span: 12 }));
    harness.advance(10);
    harness.share.receive(ANA, laser({ at: [5, 5], pts: [4, 4], span: 9 }));
    harness.laser.at = [50, 50];
    harness.laser.on = true;
    harness.laser.pts = [40, 40, 50, 50];
    harness.laser.span = 31;
    harness.laser.changed();
    const count = harness.sent.length;
    harness.advance(MARKS_INTERVAL_MS);
    // The last change went out, once, with everything since the message before it.
    expect(harness.sent.length).toBe(count + 1);
    expect(lastMarks(harness)?.lasers).toEqual([
      { who: 'gm', color: '#ff0059', size: 16, at: [50, 50], pts: [40, 40, 50, 50], on: true, span: 31 },
      { who: ANA, color: '#66ffa9', size: 16, at: [5, 5], pts: [2, 2, 3, 3, 4, 4], on: true, span: 21 },
    ]);
    // A player who tells no span is sent on without one, and long pauses add up to no more than a message may tell.
    harness.share.receive(ANA, laser({ pts: [6, 6], span: 30 }));
    harness.share.receive(ANA, laser({ pts: [7, 7] }));
    harness.share.receive(BEN, laser({ pts: [8, 8], span: 900 }));
    harness.share.receive(BEN, laser({ pts: [9, 9], span: 900 }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers.find((entry) => entry.who === ANA)).not.toHaveProperty('span');
    expect(lastMarks(harness)?.lasers.find((entry) => entry.who === BEN)?.span).toBe(MAX_LASER_SPAN_MS);
    harness.share.receive(ANA, laser({ pts: [8, 8], span: 30 }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers.find((entry) => entry.who === ANA)?.span).toBe(30);
  });

  it('sends a measurement being dragged on with the time since its end was last told: the GM\'s own, and a player\'s as it came', async () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    const drag = (x: number): Promise<void> => harness.measure({ live: { shape: 'line', start: { x: 0, y: 0 }, end: { x, y: 0 } }, kept: [] });
    await drag(0);
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.measures[0]).toEqual({ who: 'gm', color: '#123456', live: { shape: 'line', a: [0, 0], b: [0, 0] }, kept: [] });
    harness.advance(7);
    await drag(10);
    harness.advance(8);
    await drag(20);
    harness.share.receive(BEN, measure({ span: 400 }));
    expect(harness.shown?.measures).toEqual([{ who: BEN, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [], span: 400 }]);
    harness.advance(5);
    harness.share.receive(BEN, measure({ live: { shape: 'line', a: [10, 10], b: [90, 10] }, span: 5 }));
    harness.share.receive(ANA, measure({ span: 9 }));
    // The GM's overlay is told the time of the measurement that just arrived, and no time again for those that stand.
    expect(harness.shown?.measures).toEqual([
      { who: BEN, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [90, 10] }, kept: [] },
      { who: ANA, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [], span: 9 },
    ]);
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.measures).toEqual([
      { who: 'gm', color: '#123456', live: { shape: 'line', a: [0, 0], b: [20, 0] }, kept: [], span: MARKS_INTERVAL_MS + 15 },
      { who: BEN, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [90, 10] }, kept: [], span: 405 },
      { who: ANA, color: '#66ffa9', live: { shape: 'line', a: [10, 10], b: [80, 10] }, kept: [], span: 9 },
    ]);
    // A player who tells no time is sent on without one, as is one whose measurements stand; no time passed for the GM's.
    harness.share.receive(BEN, measure({ live: { shape: 'line', a: [10, 10], b: [95, 10] }, span: 30 }));
    harness.share.receive(BEN, measure({ live: { shape: 'line', a: [10, 10], b: [99, 10] } }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.measures.map((entry) => entry.span)).toEqual([0, undefined, undefined]);
    expect(checkMeasure(measure({ live: { shape: 'line', a: [0, 0], b: [0, 9000] }, span: 33 }), CONTEXT)).toEqual({ color: '#66ffa9', live: null, kept: [] });
  });

  it('forgets a laser that went silent, a player who left and the marks of another scene', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser());
    harness.share.receive(BEN, measure());
    harness.share.receive(BEN, laser({ scene: 'old' }));
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers.map((entry) => entry.who)).toEqual([ANA]);
    harness.advance(LASER_SILENCE_MS + 10);
    harness.share.update();
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.lasers).toEqual([]);
    harness.share.playerLeft(BEN);
    harness.advance(MARKS_INTERVAL_MS);
    expect(lastMarks(harness)?.measures).toEqual([]);
    harness.share.receive(ANA, measure());
    harness.share.setScene('s2');
    harness.advance(MARKS_INTERVAL_MS);
    expect(harness.sent.filter(({ body }) => body.scene === 's2').every(({ body }) => body.measures.length === 0)).toBe(true);
    expect(harness.shown).toEqual({ lasers: [], measures: [] });
  });

  it('takes a laser that went silent off the GM\'s map without waiting for the next marks', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(ANA, laser());
    harness.advance(LASER_SILENCE_MS + 10);
    expect(harness.shown?.lasers.map((entry) => entry.who)).toEqual([ANA]);
    harness.share.update();
    expect(harness.shown?.lasers).toEqual([]);
  });

  it('sends the last marks to a player who joins', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(BEN, measure());
    harness.advance(MARKS_INTERVAL_MS);
    harness.share.resend(ANA);
    expect(harness.sent.at(-1)).toEqual({ body: lastMarks(harness), to: ANA });
  });

  it('goes to everyone through the live lane, one waiting at most, and to a joiner in order with the rest', () => {
    const harness = markHarness();
    harness.share.setScene('s1');
    harness.share.receive(BEN, measure());
    harness.advance(MARKS_INTERVAL_MS);
    expect(harness.live).toEqual(['marks']);
    expect(harness.sent.at(-1)?.to).toBeUndefined();
    harness.share.resend(ANA);
    expect(harness.live).toHaveLength(1);
    expect(harness.sent.at(-1)?.to).toBe(ANA);
  });
});
