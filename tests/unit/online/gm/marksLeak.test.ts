import type { MarksMessage, SharedMeasure } from '../../../../src/app/online/protocol/index.ts';
import type { Measurements } from '../../../../src/app/pixi/MeasureRenderer';
import type { MeasureRecord } from '../../../../src/app/pixi/utils/measureDrawing';
import type { TokenEntity } from '../../../../src/app/types';
import { measureOriginOf, measureShownToPlayers, tokenFootprints, type MeasureOrigin } from '../../../../src/app/vision/measureOrigin';
import { describe, expect, it } from 'vitest';
import { markHarness } from './markHarness.ts';

/** A seeded generator (mulberry32), so a failing trial can be replayed by its seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

const TRIALS = 40;
const STEPS = 60;
const GRID = 70;

interface Truth {
  readonly origin: MeasureOrigin;
  readonly start: MeasureRecord['start'];
}

const key = (a: readonly number[], b: readonly number[]): string => `${a.join(',')}>${b.join(',')}`;

/**
 * The GM's measurements never reach players when Atlas's own rule hides them: one that starts on a
 * hidden token, or on one the players did not see at its start, never shows, and one whose tokens the
 * players stop seeing goes with them. Generated scenes: tokens of every role, measurements begun on
 * tokens and beside them, dragged, kept or let go, while tokens move and the players' sight changes.
 */
describe('the GM\'s measurements players see', () => {
  /** Measurements players were sent over all trials, so the trials cannot pass by sending none. */
  let shown = 0;
  for (let trial = 0; trial < TRIALS; trial += 1) {
    it(`follow Atlas's rule (seed ${trial})`, async () => {
      const random = seeded(trial + 1);
      const int = (max: number): number => Math.floor(random() * max);
      const harness = markHarness({ width: 1400, height: 1400 });
      const tokens: Record<string, TokenEntity> = {};
      const hidden = new Set<string>();
      const unseen = new Set<string>();
      for (let index = 0; index < 4 + int(10); index += 1) {
        const id = `t${index}`;
        tokens[id] = { id, kind: 'token', x: 70 + int(1200), y: 70 + int(1200), size: [0.5, 1, 2][int(3)] ?? 1, imagePath: `art/${id}.webp` };
        if (random() < 0.25) hidden.add(id);
        else if (random() < 0.3) unseen.add(id);
      }
      const seen = (id: string): boolean => !hidden.has(id) && !unseen.has(id);
      harness.footprints = tokenFootprints(tokens, {}, GRID, 1);
      harness.seen = seen;
      const truths = new Map<string, Truth>();
      let records: Measurements = { live: null, kept: [] };
      const check = (measure: SharedMeasure): void => {
        const truth = truths.get(key(measure.a, measure.b));
        expect(truth, `a measurement the GM drew: ${key(measure.a, measure.b)}`).toBeDefined();
        if (truth === undefined) return;
        expect(truth.origin.tokenIds.some((id) => hidden.has(id)), 'begun on a hidden token').toBe(false);
        expect(measureShownToPlayers(truth.origin, seen), 'Atlas\'s rule').toBe(true);
        shown += 1;
      };
      harness.onSend = (body: MarksMessage) => {
        for (const entry of body.measures.filter((measures) => measures.who === 'gm')) [...(entry.live === null ? [] : [entry.live]), ...entry.kept].forEach(check);
      };
      harness.share.setScene('s1');
      const point = (): { x: number; y: number } => {
        const ids = Object.keys(tokens);
        const on = tokens[ids[int(ids.length)] ?? ''];
        return on !== undefined && random() < 0.7 ? { x: on.x + int(30) - 15, y: on.y + int(30) - 15 } : { x: int(1400), y: int(1400) };
      };
      const set = async (next: Measurements): Promise<void> => {
        records = next;
        await harness.measure(next);
      };
      for (let step = 0; step < STEPS; step += 1) {
        const roll = random();
        if (roll < 0.25) {
          // A press begins a measurement; its start is snapped near the press.
          const press = point();
          harness.laser.pressAt(press.x, press.y);
          const start = { x: press.x + int(20) - 10, y: press.y + int(20) - 10 };
          const live: MeasureRecord = { shape: (['line', 'circle', 'cone'] as const)[int(3)] ?? 'line', start, end: start };
          truths.set(key([start.x, start.y], [start.x, start.y]), { start, origin: measureOriginOf([press, start], harness.footprints, seen) });
          await set({ ...records, live });
        } else if (roll < 0.45 && records.live !== null) {
          const live = { ...records.live, end: { x: int(1400), y: int(1400) } };
          const truth = [...truths.values()].find((candidate) => candidate.start === live.start);
          if (truth !== undefined) truths.set(key([live.start.x, live.start.y], [live.end.x, live.end.y]), truth);
          await set({ ...records, live });
        } else if (roll < 0.55 && records.live !== null) {
          await set({ live: records.live, kept: [...records.kept, { ...records.live }] });
          await set({ ...records, live: null });
        } else if (roll < 0.62) {
          await set({ ...records, live: null });
        } else if (roll < 0.66) {
          await set({ live: records.live, kept: [] });
        } else if (roll < 0.82) {
          const id = Object.keys(tokens)[int(Object.keys(tokens).length)] ?? '';
          if (!hidden.has(id) && unseen.has(id)) unseen.delete(id);
          else if (!hidden.has(id)) unseen.add(id);
          harness.share.update();
        } else if (roll < 0.9) {
          const id = Object.keys(tokens)[int(Object.keys(tokens).length)] ?? '';
          const moved = tokens[id];
          if (moved !== undefined) tokens[id] = { ...moved, x: 70 + int(1200), y: 70 + int(1200) };
          harness.footprints = tokenFootprints(tokens, {}, GRID, 1);
          harness.share.update();
        }
        harness.advance(int(150));
      }
      harness.advance(1000);
      expect(harness.sent.length).toBeGreaterThan(0);
    });
  }

  it('sent some measurements at all', () => {
    expect(shown).toBeGreaterThan(TRIALS);
  });
});
