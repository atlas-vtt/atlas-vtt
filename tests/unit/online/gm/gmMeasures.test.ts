import { describe, expect, it } from 'vitest';
import type { KeptMeasure, Measurement } from '../../../../src/app/measure/measureTypes';
import { GmMeasures, type PlayersView } from '../../../../src/app/online/gm/gmMeasures.ts';
import { MAX_MARK_KEPT, MAX_RULER_NUMBERS, parseGmMessage, type FullMeasures, type MeasureState } from '../../../../src/app/online/protocol/index.ts';
import { MAX_RULER_POINTS } from '../../../../src/app/measure/measureTypes';
import type { LiveMeasure } from '../../../../src/app/pixi/measure/measurements';

const at = (x: number, y = 0): { x: number; y: number } => ({ x, y });
const EVERYONE = (): boolean => true;
const EMPTY_MAP: PlayersView = { footprints: () => [], seen: () => EVERYONE };
const GOBLIN: PlayersView = { footprints: () => [{ id: 'goblin', x: 0, y: 0, radius: 30 }], seen: () => (id) => id !== 'goblin' };

let ids = 0;
const kept = (measure: Measurement & Partial<KeptMeasure>): KeptMeasure => ({ id: `m${ids += 1}`, kind: 'measure', ...measure, points: [...measure.points] });
const live = (shape: Measurement['shape'], points: { x: number; y: number }[], more: Partial<LiveMeasure> = {}): LiveMeasure => ({ shape, points, pressed: points[0]!, ...more });

type Records = { live?: LiveMeasure | null; kept?: KeptMeasure[]; walled?: boolean };

function told(records: Records, view: PlayersView = EMPTY_MAP, seen: (id: string) => boolean = EVERYONE): ReturnType<GmMeasures['shown']> {
  const measures = new GmMeasures();
  measures.follow({ live: records.live ?? null, kept: records.kept ?? [], ...(records.walled !== undefined && { walled: records.walled }) }, view, 0);
  return measures.shown(seen);
}

/** What players are told in the older words, which every page reads. */
function shown(records: Records, view: PlayersView = EMPTY_MAP, seen: (id: string) => boolean = EVERYONE): Pick<MeasureState, 'live' | 'kept'> {
  const { live, kept } = told(records, view, seen);
  return { live, kept };
}

/** What they are told in full. */
const full = (records: Records, view: PlayersView = EMPTY_MAP, seen: (id: string) => boolean = EVERYONE): FullMeasures => told(records, view, seen).full;

describe('the GM\'s measurements in the protocol\'s words', () => {
  it('tells a ruler of one leg as a line, and a circle and a cone as themselves', () => {
    expect(shown({ live: live('ruler', [at(0), at(70.04)]) })).toEqual({ live: { shape: 'line', a: [0, 0], b: [70, 0] }, kept: [] });
    expect(shown({ kept: [kept({ shape: 'circle', points: [at(0), at(70)] }), kept({ shape: 'cone', points: [at(0), at(0, 70)] })] }).kept).toEqual([
      { shape: 'circle', a: [0, 0], b: [70, 0] },
      { shape: 'cone', a: [0, 0], b: [0, 70] },
    ]);
  });

  it('tells a ruler with corners leg by leg: the legs before the last among the kept ones, the last as the live one', () => {
    const earlier = kept({ shape: 'circle', points: [at(500), at(570)] });
    expect(shown({ live: live('ruler', [at(0), at(70), at(70, 70), at(140, 70)]), kept: [earlier] })).toEqual({
      live: { shape: 'line', a: [70, 70], b: [140, 70] },
      kept: [{ shape: 'circle', a: [500, 0], b: [570, 0] }, { shape: 'line', a: [0, 0], b: [70, 0] }, { shape: 'line', a: [70, 0], b: [70, 70] }],
    });
    expect(shown({ kept: [kept({ shape: 'ruler', points: [at(0), at(70), at(70, 70)] })] })).toEqual({
      live: null,
      kept: [{ shape: 'line', a: [0, 0], b: [70, 0] }, { shape: 'line', a: [70, 0], b: [70, 70] }],
    });
  });

  it('tells every ruler as one line from its start to its end where the legs are more than a message holds', () => {
    const route = (row: number): KeptMeasure => kept({ shape: 'ruler', points: [at(0, row), at(70, row), at(70, row + 35), at(140, row + 35)] });
    const fits = Array.from({ length: Math.floor(MAX_MARK_KEPT / 3) }, (_, index) => route(index * 100));
    expect(shown({ kept: fits }).kept).toHaveLength(fits.length * 3);
    const tooMany = [...fits, route(5000)];
    expect(shown({ kept: tooMany }).kept).toEqual(tooMany.map(({ points }) => ({ shape: 'line', a: [points[0]!.x, points[0]!.y], b: [points[3]!.x, points[3]!.y] })));
    // And of more measurements than that, the newest.
    const many = Array.from({ length: MAX_MARK_KEPT + 5 }, (_, index) => kept({ shape: 'ruler', points: [at(index), at(index + 70)] }));
    expect(shown({ kept: many }).kept.map((measure) => measure.a[0])).toEqual(many.slice(-MAX_MARK_KEPT).map(({ points }) => points[0]!.x));
  });

  it('tells nothing of a square or a line with a width, which the protocol cannot say, nor of a measurement off every map', () => {
    expect(shown({ kept: [kept({ shape: 'square', points: [at(0), at(70)] }), kept({ shape: 'line', points: [at(0), at(70)], width: 70 })] })).toEqual({ live: null, kept: [] });
    expect(shown({ live: live('ruler', [at(0), at(Number.POSITIVE_INFINITY)]) })).toEqual({ live: null, kept: [] });
  });
});

describe('the GM\'s measurements in full', () => {
  const ruler = { shape: 'ruler' as const, points: [at(0), at(70.04), at(70, 70), at(140, 70)] };

  it('tell a ruler with every corner, as one measurement, live or kept', () => {
    const pts = [0, 0, 70, 0, 70, 70, 140, 70];
    expect(full({ live: live('ruler', ruler.points) })).toEqual({ live: { shape: 'ruler', pts }, kept: [] });
    expect(full({ kept: [kept(ruler)] })).toEqual({ live: null, kept: [{ shape: 'ruler', pts }] });
  });

  it('tell a square, and a line with its width, which the older words cannot say', () => {
    const records = { kept: [kept({ shape: 'square', points: [at(0), at(70)] }), kept({ shape: 'line', points: [at(0), at(210)], width: 70.04 })], live: live('line', [at(0), at(0, 140)], { width: 35 }) };
    expect(full(records)).toEqual({
      live: { shape: 'line', pts: [0, 0, 0, 140], width: 35 },
      kept: [{ shape: 'square', pts: [0, 0, 70, 0] }, { shape: 'line', pts: [0, 0, 210, 0], width: 70 }],
    });
    expect(shown(records)).toEqual({ live: null, kept: [] });
  });

  it('tell an area on a level with walls too, and say which walls do not stop', () => {
    const circle = { shape: 'circle' as const, points: [at(0), at(70)] };
    const records = { live: live('cone', [at(0), at(0, 70)]), kept: [kept(circle), kept({ ...circle, walls: false })], walled: true };
    expect(full(records)).toEqual({
      live: { shape: 'cone', pts: [0, 0, 0, 70] },
      kept: [{ shape: 'circle', pts: [0, 0, 70, 0] }, { shape: 'circle', pts: [0, 0, 70, 0], free: true }],
    });
    // The older words say only the one that walls do not cut.
    expect(shown(records)).toEqual({ live: null, kept: [{ shape: 'circle', a: [0, 0], b: [70, 0] }] });
    expect(full({ ...records, walled: false })).toEqual(full(records));
  });

  it('never tell an aura: players get none', () => {
    const aura = kept({ shape: 'circle', points: [at(0), at(70)], follows: 'hero', aura: 10 });
    const plain = kept({ shape: 'circle', points: [at(300), at(370)] });
    expect(told({ kept: [aura, plain] })).toEqual({ live: null, kept: [{ shape: 'circle', a: [300, 0], b: [370, 0] }], full: { live: null, kept: [{ shape: 'circle', pts: [300, 0, 370, 0] }] } });
  });

  it('tell nothing of a measurement the GM keeps to themselves, one that started on a token unseen then, or one off every map', () => {
    const fromUnseen = kept({ shape: 'square', points: [at(0), at(70)], origin: { tokenIds: ['orc'], unseenAtStart: true } });
    const fromHero = kept({ shape: 'line', points: [at(200), at(270)], width: 70, origin: { tokenIds: ['hero'], unseenAtStart: false } });
    const own = kept({ shape: 'ruler', points: [at(0), at(70), at(70, 70)], hidden: true });
    const records = { live: live('square', [at(0), at(70)], { hidden: true }), kept: [fromUnseen, fromHero, own] };
    expect(full(records).kept).toEqual([{ shape: 'line', pts: [200, 0, 270, 0], width: 70 }]);
    expect(full(records).live).toBeNull();
    expect(full(records, EMPTY_MAP, (id) => id !== 'hero')).toEqual({ live: null, kept: [] });
    expect(full({ live: live('ruler', [at(0), at(Number.POSITIVE_INFINITY)]), kept: [kept({ shape: 'circle', points: [at(2e6), at(70)] })] })).toEqual({ live: null, kept: [] });
  });

  it('hold a ruler of as many points as Atlas keeps, the newest measurements where there are more than a message holds, and read back as sent', () => {
    expect(MAX_RULER_NUMBERS).toBe(2 * MAX_RULER_POINTS);
    const longest = kept({ shape: 'ruler', points: Array.from({ length: MAX_RULER_POINTS }, (_, index) => at(index * 70, (index % 2) * 70)) });
    const many = Array.from({ length: MAX_MARK_KEPT + 5 }, (_, index) => kept({ shape: 'square', points: [at(index), at(index + 70)] }));
    const all = told({ kept: [...many, longest], live: live('line', [at(0), at(70)], { width: 140 }) });
    expect(all.full.kept).toHaveLength(MAX_MARK_KEPT);
    expect(all.full.kept.at(-1)?.pts).toHaveLength(MAX_RULER_NUMBERS);
    expect(all.full.kept[0]?.pts[0]).toBe(6);
    const marks = { t: 'marks', scene: 's1', lasers: [], measures: [{ who: 'gm', color: '#123456', ...all }] };
    expect(parseGmMessage(JSON.parse(JSON.stringify(marks)))).toEqual(marks);
  });
});

describe('an area that stops at walls', () => {
  const circle = { shape: 'circle' as const, points: [at(0), at(70)] };
  const cone = { shape: 'cone' as const, points: [at(0), at(0, 70)] };

  it('is told whole only while no wall stands on its level: walls would cut it for the GM, and the protocol cannot say the cut', () => {
    const whole = { live: { shape: 'circle', a: [0, 0], b: [70, 0] }, kept: [{ shape: 'cone', a: [0, 0], b: [0, 70] }] };
    expect(shown({ live: live('circle', circle.points), kept: [kept(cone)], walled: false })).toEqual(whole);
    expect(shown({ live: live('circle', circle.points), kept: [kept(cone)], walled: true })).toEqual({ live: null, kept: [] });
  });

  it('is told on a level with walls once it is kept as one that walls do not stop; a ruler always', () => {
    const records = { kept: [kept({ ...circle, walls: false }), kept(cone), kept({ shape: 'ruler', points: [at(0), at(70)] })], walled: true };
    expect(shown(records).kept).toEqual([{ shape: 'circle', a: [0, 0], b: [70, 0] }, { shape: 'line', a: [0, 0], b: [70, 0] }]);
  });
});

describe('which of the GM\'s measurements players are told', () => {
  it('never one the GM measures or keeps for themselves', () => {
    expect(shown({ live: live('ruler', [at(0), at(70)], { hidden: true }), kept: [kept({ shape: 'ruler', points: [at(0), at(70)], hidden: true })] })).toEqual({ live: null, kept: [] });
  });

  it('a kept one by the origin it was kept with: never when it started on a token unseen then, else while its tokens are seen', () => {
    const fromUnseen = kept({ shape: 'ruler', points: [at(0), at(70)], origin: { tokenIds: ['orc'], unseenAtStart: true } });
    const fromHero = kept({ shape: 'ruler', points: [at(200), at(270)], origin: { tokenIds: ['hero'], unseenAtStart: false } });
    const told = (seen: (id: string) => boolean): number[] => shown({ kept: [fromUnseen, fromHero] }, EMPTY_MAP, seen).kept.map((measure) => measure.a[0]);
    expect(told(EVERYONE)).toEqual([200]);
    expect(told((id) => id !== 'hero')).toEqual([]);
  });

  it('the live one by what it started on: the tokens under its press and its start, as these players saw them then', () => {
    const measures = new GmMeasures();
    const pressed = at(10);
    measures.follow({ live: { shape: 'ruler', points: [at(35), at(105)], pressed }, kept: [] }, GOBLIN, 0);
    expect(measures.shown((id) => id !== 'goblin').live).toBeNull();
    // The goblin shows itself: a measurement begun while it was unseen stays the GM's.
    measures.follow({ live: { shape: 'ruler', points: [at(35), at(175)], pressed }, kept: [] }, { ...GOBLIN, seen: () => EVERYONE }, 10);
    expect(measures.shown(EVERYONE).live).toBeNull();
    // Kept from it, with an origin that says less, it is still held to what these players saw at its start.
    const keptFromIt = kept({ shape: 'ruler', points: [at(35), at(175)] });
    measures.follow({ live: null, kept: [keptFromIt] }, { ...GOBLIN, seen: () => EVERYONE }, 20);
    expect(measures.shown(EVERYONE).kept).toEqual([]);
    // Another press at the same place is another measurement, judged anew.
    measures.follow({ live: { shape: 'ruler', points: [at(35), at(105)], pressed: at(10) }, kept: [keptFromIt] }, { ...GOBLIN, seen: () => EVERYONE }, 30);
    expect(measures.shown(EVERYONE).live).toEqual({ shape: 'line', a: [35, 0], b: [105, 0] });
  });

  it('times the live end from one telling to the next, and starts anew with another measurement', () => {
    const measures = new GmMeasures();
    const pressed = at(0);
    measures.follow({ live: { shape: 'ruler', points: [at(0), at(70)], pressed }, kept: [] }, EMPTY_MAP, 100);
    expect(measures.takeSpan()).toBeUndefined();
    measures.follow({ live: { shape: 'ruler', points: [at(0), at(140)], pressed }, kept: [] }, EMPTY_MAP, 140);
    expect(measures.takeSpan()).toBe(40);
    measures.follow({ live: { shape: 'ruler', points: [at(0), at(140)], pressed: at(0) }, kept: [] }, EMPTY_MAP, 200);
    expect(measures.takeSpan()).toBeUndefined();
  });
});
