import { describe, expect, it } from 'vitest';
import { CHAMBER_TIERS, type ChamberTier, TIER_FLOORS, TIER_WEIGHTS, type TierDraw, type TierRules, drawTier, fitsTier, tagTierRules, tierIndex, tierOfFloor, tierSize } from '../../../../../src/app/dungeons/layout/cavern/veins/caveSizes';
import { rngFrom } from '../../../../../src/app/dungeons/rng';
import type { DungeonTag } from '../../../../../src/app/dungeons/tags';

const DRAWS = 10_000;
const PLAIN: TierRules = { shift: 0, cap: 'gargantuan', flat: false };

function shares(rules: TierRules, draw: TierDraw = { gargantuan: true }, seed = 1): Record<ChamberTier, number> {
  const rng = rngFrom(seed);
  const counts = Object.fromEntries(CHAMBER_TIERS.map((tier) => [tier, 0])) as Record<ChamberTier, number>;
  for (let k = 0; k < DRAWS; k++) counts[drawTier(rng, rules, draw)]++;
  return Object.fromEntries(CHAMBER_TIERS.map((tier) => [tier, (counts[tier] / DRAWS) * 100])) as Record<ChamberTier, number>;
}

const mean = (s: Record<ChamberTier, number>): number => CHAMBER_TIERS.reduce((sum, tier) => sum + tierIndex(tier) * s[tier], 0) / 100;

describe('cave size tiers', () => {
  it('draw each tier within three points of its weight per hundred', () => {
    const drawn = shares(PLAIN);
    for (const tier of CHAMBER_TIERS) expect(Math.abs(drawn[tier] - TIER_WEIGHTS[tier]), tier).toBeLessThanOrEqual(3);
  });

  it('draw the cave’s common tier about twice as often', () => {
    const plain = shares(PLAIN);
    const common = shares({ ...PLAIN, common: 'quadruple' });
    // Doubling one weight of a hundred: 12 of 112 against 12 of 100, so about 21.4 %.
    expect(common.quadruple).toBeGreaterThan(plain.quadruple * 1.6);
    expect(Math.abs(common.quadruple - (2 * 12 * 100) / 112)).toBeLessThanOrEqual(3);
  });

  it('keep more to the common tier in an ordered cave, to none in a chaotic one', () => {
    const with_ = (tags: DungeonTag[]): number => shares({ ...PLAIN, common: 'house', commonWeight: tagTierRules(new Set(tags)).commonWeight }).house;
    expect(with_(['ordered'])).toBeGreaterThan(with_([]) + 5);
    expect(Math.abs(with_(['chaotic']) - TIER_WEIGHTS.house)).toBeLessThanOrEqual(3);
  });

  it('lean smaller with small or cramped, larger with large or spacious, a small cave never past a house', () => {
    const of = (tags: DungeonTag[]): TierRules => ({ ...PLAIN, ...tagTierRules(new Set(tags)) });
    const plain = mean(shares(PLAIN));
    expect(mean(shares(of(['cramped'])))).toBeLessThan(plain - 0.5);
    expect(mean(shares(of(['large'])))).toBeGreaterThan(plain + 0.5);
    expect(mean(shares(of(['spacious'])))).toBeGreaterThan(plain + 0.5);
    const small = shares(of(['small']));
    expect(small.hall + small.gargantuan).toBe(0);
    expect(tagTierRules(new Set<DungeonTag>(['small', 'large'])).shift).toBe(0);
  });

  it('draw a gargantuan cave only where the floor allows one, a hall in its place', () => {
    const none = shares(PLAIN, { gargantuan: false });
    expect(none.gargantuan).toBe(0);
    expect(Math.abs(none.hall - (TIER_WEIGHTS.hall + TIER_WEIGHTS.gargantuan))).toBeLessThanOrEqual(1.5);
  });

  it('draw every tier alike, gargantuan twice, when the cave changes scale unpredictably', () => {
    const flat = shares({ ...PLAIN, flat: true });
    for (const tier of CHAMBER_TIERS) expect(Math.abs(flat[tier] - (tier === 'gargantuan' ? 200 : 100) / 8), tier).toBeLessThanOrEqual(2);
  });

  it('lean away from the parent’s size, and a tier larger past a squeeze', () => {
    expect(mean(shares(PLAIN, { gargantuan: true, awayFrom: 'hall' }))).toBeLessThan(mean(shares(PLAIN)) - 0.3);
    expect(mean(shares(PLAIN, { gargantuan: true, awayFrom: 'room' }))).toBeGreaterThan(mean(shares(PLAIN)) + 0.3);
    expect(mean(shares(PLAIN, { gargantuan: true, opens: true }))).toBeGreaterThan(mean(shares(PLAIN)) + 0.8);
  });

  it('size a chamber within its tier, an odd width with walls, and find a floor’s tier again', () => {
    const rng = rngFrom(7);
    for (const tier of CHAMBER_TIERS) {
      for (let k = 0; k < 50; k++) {
        const size = tierSize(rng, tier);
        expect(size.width % 2).toBe(1);
        expect(fitsTier(tier, size.width - 2, size.depth - 2)).toBe(true);
        expect(tierOfFloor(size.width - 2, size.depth - 2)).toBe(tier);
      }
      expect(TIER_FLOORS[tier].across.every((across) => across >= 3)).toBe(true);
    }
    expect(tierOfFloor(11, 10)).toBe('house');
    expect(tierOfFloor(9, 12)).toBe('quadruple');
    expect(tierOfFloor(3, 7)).toBe('room');
  });
});
