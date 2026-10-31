import { describe, expect, it } from 'vitest';
import { CAVE_ALWAYS_TRAITS, CAVE_NEVER_TRAITS } from '../../../../../src/app/dungeons/caveModel';
import { characterModifiers, drawCharacter } from '../../../../../src/app/dungeons/layout/cavern/veins/caveCharacter';
import { caveParams, withVeins } from '../../../../../src/app/dungeons/layout/cavern/caveParams';
import { dungeonParams } from '../../../../../src/app/dungeons/params';
import { rngFrom, stream } from '../../../../../src/app/dungeons/rng';
import { type DungeonTag, readTags } from '../../../../../src/app/dungeons/tags';

const draws = (tags: DungeonTag[], count = 3_000): ReturnType<typeof drawCharacter>[] => Array.from({ length: count }, (_, k) => drawCharacter(rngFrom(k + 1), new Set(tags)));

describe('a cave’s character', () => {
  it('reaches every always and every never trait', () => {
    const all = draws([]);
    expect(new Set(all.map((c) => c.always))).toEqual(new Set(CAVE_ALWAYS_TRAITS));
    expect(new Set(all.map((c) => c.never))).toEqual(new Set(CAVE_NEVER_TRAITS));
  });

  it('is the same for the same seed, and a tag changes only what it rules out', () => {
    expect(drawCharacter(rngFrom(42), new Set())).toEqual(drawCharacter(rngFrom(42), new Set()));
    const plain = draws([]);
    const dry = draws(['dry']);
    dry.forEach((c, k) => {
      if (!['still-pools', 'endless-drips'].includes(plain[k]!.always)) expect(c.always).toBe(plain[k]!.always);
      if (plain[k]!.never !== 'calm-water') expect(c.never).toBe(plain[k]!.never);
    });
  });

  it('keeps out what the tags rule out, passing to the next trait in the list', () => {
    const ruled: [DungeonTag, string[]][] = [
      ['flat', ['up-and-down']],
      ['dry', ['still-pools', 'endless-drips', 'calm-water']],
      ['string', ['curves-back', 'dead-passages']],
      ['lava', ['endless-drips', 'still-pools', 'flowstone-crust', 'calm-water']],
    ];
    for (const [tag, out] of ruled) {
      for (const c of draws([tag])) {
        expect(out).not.toContain(c.always);
        expect(out).not.toContain(c.never);
      }
    }
    const at = CAVE_ALWAYS_TRAITS.indexOf('up-and-down');
    const plain = draws([]);
    draws(['flat']).forEach((c, k) => {
      if (plain[k]!.always === 'up-and-down') expect(c.always).toBe(CAVE_ALWAYS_TRAITS[(at + 1) % CAVE_ALWAYS_TRAITS.length]);
    });
  });

  it('turns each trait into the numbers the layout reads', () => {
    const of = (always: (typeof CAVE_ALWAYS_TRAITS)[number], never: (typeof CAVE_NEVER_TRAITS)[number]): ReturnType<typeof characterModifiers> => characterModifiers({ always, never });
    const plain = of('balanced-boulders', 'regular-caves');
    expect(plain.loops).toBe(1);
    expect(plain.exits).toEqual({ shrink: 0, squeezes: false, noWalk: false, vertical: 'any', breakdowns: true });
    expect(of('curves-back', 'regular-caves').exits.breakdowns).toBe(false);
    expect(plain.leanAway).toBe(true);
    expect(plain.continuing).toBe(0.5);
    expect(of('curves-back', 'dead-passages').loops).toBe(4);
    expect(of('curves-back', 'calm-water').passageSides).toBeGreaterThan(0.5);
    expect(of('low-roofs', 'calm-water').exits.shrink).toBe(2);
    expect(of('floor-exits', 'calm-water').exits.vertical).toBe('down');
    expect(of('roof-exits', 'calm-water').exits.vertical).toBe('up');
    expect(of('maximum-size', 'calm-water').tierStep).toBe(1);
    expect(of('still-pools', 'calm-water')).toMatchObject({ leastWater: 0.3, basins: 1.5, streamFalls: true });
    expect(of('cracks-everywhere', 'calm-water').faultLines).toBe(2);
    expect(of('up-and-down', 'plain-walk')).toMatchObject({ steps: 6, exits: { noWalk: true } });
    expect(of('up-and-down', 'sloped-walls')).toMatchObject({ steps: 0, pitchesOnly: true });
    expect(of('blocked-ways', 'standing-room')).toMatchObject({ blockedWays: 1 / 3, exits: { noWalk: true } });
    expect(of('narrows-then-opens', 'dead-passages')).toMatchObject({ opensPastSqueeze: true, continuing: 1, exits: { squeezes: true } });
    expect(of('shifting-scale', 'calm-water').shiftingScale).toBe(true);
  });

  it('changes scale by its chambers alone, never by the planner’s passages: a cave that changes scale has the size styles of any other', () => {
    const base = caveParams(dungeonParams(readTags(['wet', 'winding'])));
    let shifting = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const params = withVeins(base, stream(seed, 'cave', 'character'));
      if (params.cave?.veins?.character.always !== 'shifting-scale') continue;
      shifting++;
      expect(params.sizeStyles, `seed ${seed}`).toEqual(base.sizeStyles);
      expect(params.cave.veins.tiers.flat).toBe(true);
    }
    expect(shifting).toBeGreaterThan(0);
  });
});
