import { describe, expect, it } from 'vitest';
import { CAVE_VARIANTS, type CaveVariant } from '../../../../../src/app/dungeons/caveModel';
import { generateDungeon } from '../../../../../src/app/dungeons/generate';
import { caveParams, caveVariant, withVeins } from '../../../../../src/app/dungeons/layout/cavern/caveParams';
import { drawFormation } from '../../../../../src/app/dungeons/layout/cavern/veins/caveFormation';
import { CHAMBER_TIERS, type ChamberTier } from '../../../../../src/app/dungeons/layout/cavern/veins/caveSizes';
import type { DungeonModel } from '../../../../../src/app/dungeons/model';
import { dungeonParams, dungeonTags } from '../../../../../src/app/dungeons/params';
import { stream } from '../../../../../src/app/dungeons/rng';
import { type DungeonTag, readTags } from '../../../../../src/app/dungeons/tags';
import { faultStretch } from '../../caveChecks';

/**
 * What made a cave: the book's odds among the natural formations, the tags that name one, and the
 * numbers each formation changes, measured over a hundred caves of it against a hundred river caves.
 */

const HEAVY = 600_000;
const CAVES = 100;
const tags = (list: string[]): ReadonlySet<DungeonTag> => new Set(readTags(list));
const formationOf = (seed: number): CaveVariant => drawFormation(stream(seed, 'cave', 'formation'));
const variantOf = (seed: number, list: string[]): CaveVariant | undefined => withVeins(caveParams(dungeonParams(readTags(list))), stream(seed, 'cave', 'character'), stream(seed, 'cave', 'formation')).cave?.variant;

/** The first `count` seeds whose untagged cave the seed makes of `variant`, none tagged by chance (`string`, `deep`). */
function seedsOf(variant: CaveVariant, count: number): number[] {
  const out: number[] = [];
  for (let k = 1; out.length < count; k++) {
    const seed = k * 7_309;
    if (dungeonTags(seed, []).length === 0 && formationOf(seed) === variant) out.push(seed);
  }
  return out;
}

/** A hundred caves of `variant`: drawn by the seed, a sulphuric one asked for by its tag, the only way to one. */
const cavesOf = (variant: CaveVariant): DungeonModel[] =>
  variant === 'sulphuric'
    ? seedsOf('limestone', CAVES).map((seed) => generateDungeon({ seed, theme: 'cavern', tags: ['acid'], floors: 1 }))
    : seedsOf(variant, CAVES).map((seed) => generateDungeon({ seed, theme: 'cavern', tags: [], floors: 1 }));
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const chambers = (model: DungeonModel): DungeonModel['floors'][number]['rooms'] => model.floors.flatMap((floor) => floor.rooms.filter((r) => r.kind === 'room'));

/** Chasms a cave holds: chasm halls and every chasm laid. */
const chasms = (model: DungeonModel): number => model.floors.reduce((sum, floor) => sum + floor.terrain.filter((p) => p.kind === 'chasm').length + floor.rooms.filter((r) => r.type === 'chasm-hall').length, 0);
/** The share of a cave's roof and floor exits that lead up. */
const upWays = (model: DungeonModel): [number, number] => chambers(model).reduce<[number, number]>(([up, all], r) => [up + (r.vertical?.up.length ?? 0), all + (r.vertical?.up.length ?? 0) + (r.vertical?.down.length ?? 0)], [0, 0]);
/** Doors past those that join the rooms in a tree: the loops. */
const loops = (model: DungeonModel): number => model.floors.reduce((sum, floor) => sum + floor.doors.filter((d) => d.from !== null && d.to !== null).length - (floor.rooms.length - 1), 0);
/** Of each passage, how many cells it is across on average. */
const passageWidths = (model: DungeonModel): number[] => model.floors.flatMap((floor) => floor.rooms.filter((r) => r.kind !== 'room' && (r.cells?.length ?? 0) > 0).map((r) => {
  const along = new Set(r.cells!.map((c) => (r.w >= r.h ? c.x : c.y)));
  return r.cells!.length / along.size;
}));
/** How far a cave's chamber tiers spread: the standard deviation of their indices. */
const tierSpread = (model: DungeonModel): number => {
  const xs = chambers(model).flatMap((r) => (r.tier && r.tier !== 'junction' ? [CHAMBER_TIERS.indexOf(r.tier as ChamberTier)] : []));
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

describe('a cave’s formation', () => {
  it('is drawn in the book’s odds: a river 5, a fault 4, fungus 2, a burrow 1, and never sulphuric without its tag', () => {
    const counts = new Map<CaveVariant, number>();
    for (let seed = 1; seed <= 10_000; seed++) counts.set(formationOf(seed), (counts.get(formationOf(seed)) ?? 0) + 1);
    const share = (v: CaveVariant): number => (counts.get(v) ?? 0) / 10_000;
    console.log(`formations of 10,000 seeds: ${[...counts].map(([v, n]) => `${v} ${n}`).join(', ')}`);
    for (const [variant, odds] of [['limestone', 5], ['fault', 4], ['fungal', 2], ['burrow', 1]] as const) expect(Math.abs(share(variant) - odds / 12)).toBeLessThan(0.015);
    expect(counts.has('lava-tube') || counts.has('underdark') || counts.has('sulphuric')).toBe(false);
  });

  it('comes from the tags where they name it, before the seed, lava and the Underdark first', () => {
    const named: [string[], CaveVariant][] = [
      [['lava', 'acid'], 'lava-tube'],
      [['large', 'overgrown'], 'underdark'],
      [['deep'], 'underdark'],
      [['acid', 'string'], 'sulphuric'],
      [['overgrown', 'dry', 'crumbling'], 'fungal'],
      [['string'], 'burrow'],
      [['dry', 'crumbling'], 'fault'],
    ];
    for (let seed = 1; seed <= 50; seed++) for (const [list, variant] of named) expect(variantOf(seed, list), `${list} seed ${seed}`).toBe(variant);
    const drawn = Array.from({ length: 200 }, (_, k) => k + 1);
    for (const seed of drawn) expect(variantOf(seed, ['dry'])).toBe(formationOf(seed));
    expect(caveVariant(tags(['dry']))).toBeNull();
  });

  it('reaches every formation, by the seed or by the tags, and keeps the cave’s other rolls', () => {
    const reached = new Set<CaveVariant>();
    for (let seed = 1; seed <= 400; seed++) reached.add(formationOf(seed));
    for (const list of [['lava'], ['large'], ['acid']]) reached.add(variantOf(1, list)!);
    expect([...reached].sort()).toEqual([...CAVE_VARIANTS].sort());
    // The formation's stream is its own: the character drawn beside it is the one the seed drew before formations.
    const seed = seedsOf('fault', 1)[0]!;
    const before = withVeins(caveParams(dungeonParams([])), stream(seed, 'cave', 'character'));
    const after = withVeins(caveParams(dungeonParams([])), stream(seed, 'cave', 'character'), stream(seed, 'cave', 'formation'));
    expect(after.cave?.veins?.character).toEqual(before.cave?.veins?.character);
    expect(before.cave?.variant).toBe('limestone');
  });

  describe('measured over a hundred caves each', () => {
    const river = cavesOf('limestone');

    it('stretches most chambers along a fault in every formation, as every cave does (rule 9)', () => {
      for (const variant of ['limestone', 'fault', 'sulphuric', 'fungal', 'burrow'] as const) {
        const stretch = (variant === 'limestone' ? river : cavesOf(variant)).map(faultStretch);
        const counted = stretch.filter((s) => s.long >= 3);
        const most = counted.filter((s) => s.along / s.long >= 0.6).length / counted.length;
        const all = stretch.reduce((sum, s) => sum + s.along, 0) / stretch.reduce((sum, s) => sum + s.long, 0);
        console.log(`${variant}: ${(100 * most).toFixed(0)} % of caves stretch most chambers along a fault, ${(100 * all).toFixed(0)} % of all chambers`);
        expect(most, variant).toBeGreaterThanOrEqual(0.85);
        expect(all, variant).toBeGreaterThanOrEqual(0.6);
      }
    }, HEAVY);

    it('tears a fault open: chambers stretched far along it, more chasms, no calcite', () => {
      const fault = cavesOf('fault');
      const stretch = (v: CaveVariant): number => withVeins(caveParams(dungeonParams([])), stream(seedsOf(v, 1)[0]!, 'cave', 'character'), stream(seedsOf(v, 1)[0]!, 'cave', 'formation')).cave!.stretch;
      const [r, f] = [mean(river.map(chasms)), mean(fault.map(chasms))];
      const halls = (models: DungeonModel[]): number => mean(models.map((m) => chambers(m).filter((c) => c.type === 'chasm-hall').length));
      console.log(`stretch: river ${stretch('limestone').toFixed(2)}, fault ${stretch('fault').toFixed(2)}; chasms a cave: river ${r.toFixed(2)}, fault ${f.toFixed(2)}; chasm halls: river ${halls(river).toFixed(2)}, fault ${halls(fault).toFixed(2)}`);
      expect(stretch('fault')).toBeGreaterThanOrEqual(2.5 * 1.75);
      expect(f).toBeGreaterThan(1.3 * r);
      expect(fault.flatMap((m) => m.floors.flatMap((fl) => fl.props)).filter((p) => ['stalagmites', 'column-formation', 'flowstone', 'curtain', 'crystals'].includes(p.kind))).toEqual([]);
    }, HEAVY);

    it('leads a sulphuric cave upward', () => {
      const sulphuric = cavesOf('sulphuric');
      const share = (models: DungeonModel[]): number => {
        const [up, all] = models.map(upWays).reduce(([a, b], [c, d]) => [a + c, b + d], [0, 0]);
        return up / all;
      };
      console.log(`roof exits among ways up and down: river ${share(river).toFixed(2)}, sulphuric ${share(sulphuric).toFixed(2)}`);
      expect(share(sulphuric)).toBeGreaterThan(0.65);
      expect(share(river)).toBeLessThan(0.6);
    }, HEAVY);

    it('splits a fungal cave into more loops', () => {
      const fungal = cavesOf('fungal');
      const [r, f] = [mean(river.map(loops)), mean(fungal.map(loops))];
      console.log(`loops a cave: river ${r.toFixed(2)}, fungal ${f.toFixed(2)}`);
      expect(f).toBeGreaterThan(1.4 * r);
    }, HEAVY);

    it('digs a burrow as one tube two cells wide, its chambers about one size', () => {
      const burrow = cavesOf('burrow');
      const wide = (models: DungeonModel[]): number => {
        const widths = models.flatMap(passageWidths);
        return widths.filter((w) => w >= 1.8).length / widths.length;
      };
      const [rs, bs] = [mean(river.map(tierSpread)), mean(burrow.map(tierSpread))];
      const [rl, bl] = [mean(river.map(loops)), mean(burrow.map(loops))];
      console.log(`passages two cells wide: river ${wide(river).toFixed(2)}, burrow ${wide(burrow).toFixed(2)}; tier spread: river ${rs.toFixed(2)}, burrow ${bs.toFixed(2)}; loops: river ${rl.toFixed(2)}, burrow ${bl.toFixed(2)}`);
      expect(wide(burrow)).toBeGreaterThan(wide(river) + 0.2);
      expect(bs).toBeLessThan(0.75 * rs);
      expect(bl).toBeLessThan(rl);
      expect(burrow.every((m) => ['den', 'chief-den'].includes(m.floors.at(-1)!.rooms.find((r) => r.boss)?.type ?? ''))).toBe(true);
    }, HEAVY);
  });
});
