import { describe, expect, it } from 'vitest';
import {
  NO_INSTANCE_NUMBERS,
  badgeNumberInView,
  numberTokensInView,
  type InstanceNumbers,
  type TokenInView,
} from '../../src/app/vision/instanceNumbers';
import { computeNextInstanceNumber } from '../../src/app/stores/tokenInstanceNumbers';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import type { TokenEntity } from '../../src/app/types';

const TRIALS = 300;
const PASSES = 12;
const ARTS = ['goblin.png', 'orc.png', ''];
type Sight = 'seen' | 'sensed' | 'unseen' | 'hidden';
interface WorldToken { id: string; art: string; rank: number; sight: Sight }

const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;

/** The rule written out the plain way: stayers keep, the others take the smallest free number in rank order. */
function oracle(previous: ReadonlyMap<string, { art: string; number: number }>, inView: readonly TokenInView[]): Map<string, { art: string; number: number }> {
  const listed = inView.filter((token, index) => inView.findIndex((other) => other.id === token.id) === index);
  const result = new Map<string, { art: string; number: number }>();
  const taken = new Map<string, number[]>();
  const newcomers: Array<TokenInView & { index: number }> = [];
  listed.forEach((token, index) => {
    const before = previous.get(token.id);
    if (before && before.art === token.art) {
      result.set(token.id, before);
      taken.set(token.art, [...(taken.get(token.art) ?? []), before.number]);
    } else newcomers.push({ ...token, index });
  });
  const key = (rank: number): number => (Number.isFinite(rank) ? rank : Number.MAX_VALUE);
  newcomers.sort((a, b) => key(a.rank) - key(b.rank) || (Number.isFinite(a.rank) === Number.isFinite(b.rank) ? a.index - b.index : Number.isFinite(a.rank) ? -1 : 1));
  for (const token of newcomers) {
    const used = taken.get(token.art) ?? [];
    let number = 1;
    while (used.includes(number)) number++;
    taken.set(token.art, [...used, number]);
    result.set(token.id, { art: token.art, number });
  }
  return result;
}

const inViewOf = (world: readonly WorldToken[]): TokenInView[] =>
  world.filter((token) => token.sight === 'seen').map(({ id, art, rank }) => ({ id, art, rank }));

/** The next pass's world: tokens appear and vanish, change art or rank, get hidden, turn sensed and are seen again. */
function step(random: () => number, world: WorldToken[], next: () => string): WorldToken[] {
  const changed = world.filter(() => random() > 0.12).map((token) => {
    const roll = random();
    if (roll < 0.1) return { ...token, art: pick(random, ARTS) };
    if (roll < 0.18) return { ...token, rank: pick(random, [1, 2, 3, 5, Number.NaN]) };
    if (roll < 0.5) return { ...token, sight: pick(random, ['seen', 'sensed', 'unseen', 'hidden'] as const) };
    return token;
  });
  const added = Array.from({ length: Math.floor(random() * 3) }, (): WorldToken => ({
    id: next(), art: pick(random, ARTS), rank: pick(random, [1, 1, 2, 3, 4]), sight: pick(random, ['seen', 'seen', 'sensed', 'hidden'] as const),
  }));
  return [...changed, ...added];
}

describe('instance numbers against a plain oracle', () => {
  it('keeps every invariant over random sequences of passes', () => {
    let newcomersFromSensed = 0;
    let identities = 0;
    for (let trial = 0; trial < TRIALS; trial++) {
      const seed = 0xbad9e + trial;
      const random = rng(seed);
      let counter = 0;
      const next = (): string => `t${counter++}`;
      let world = step(random, [], next);
      let numbers: InstanceNumbers = NO_INSTANCE_NUMBERS;
      let previousWorld: WorldToken[] = [];
      try {
        for (let pass = 0; pass < PASSES; pass++) {
          const inView = inViewOf(world);
          const result = numberTokensInView(numbers, inView);
          const unchanged = inView.length === numbers.numbers.size && inView.every(({ id, art }) => numbers.numbers.get(id)?.art === art);
          // Identity exactly when the same tokens with the same art are in view.
          expect(result === numbers).toBe(unchanged);
          if (unchanged) identities++;
          expect(new Map(result.numbers)).toEqual(oracle(numbers.numbers, inView));
          for (const art of ARTS) {
            const held = [...result.numbers.values()].filter((entry) => entry.art === art).map((entry) => entry.number);
            expect(new Set(held).size).toBe(held.length);
            expect(held.every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
            expect(result.counts.get(art) ?? 0).toBe(held.length);
          }
          for (const token of world) {
            const before = previousWorld.find((other) => other.id === token.id);
            if (token.sight === 'seen' && before?.sight === 'sensed') {
              // Only sensed in the previous pass: a newcomer, which takes the smallest number free.
              expect(numbers.numbers.has(token.id)).toBe(false);
              newcomersFromSensed++;
            }
            const seenOfArt = world.filter((other) => other.sight === 'seen' && other.art === token.art).length;
            for (const badgesOn of [true, false]) {
              const shown = badgeNumberInView(result, token.id, badgesOn) !== null;
              expect(shown).toBe(badgesOn && token.sight === 'seen' && seenOfArt >= 2);
            }
          }
          numbers = result;
          previousWorld = world;
          world = step(random, world, next);
        }
      } catch (error) {
        throw new Error(`seed ${seed}: ${String(error)}`);
      }
    }
    // The sequences reach both cases the rules single out.
    expect(newcomersFromSensed).toBeGreaterThan(50);
    expect(identities).toBeGreaterThan(50);
  });
});

describe('where every token is seen at every pass, as the player view showed so far', () => {
  it('numbers each token as the GM view does when steps only add or only delete tokens', () => {
    for (let trial = 0; trial < TRIALS; trial++) {
      const seed = 0x6e0 + trial;
      const random = rng(seed);
      let counter = 0;
      const tokens: Record<string, TokenEntity> = {};
      const add = (): void => {
        const id = `t${counter++}`;
        const imagePath = pick(random, ARTS);
        tokens[id] = { id, kind: 'token', imagePath, x: 0, y: 0, instanceNumber: computeNextInstanceNumber(tokens, imagePath) } as TokenEntity;
      };
      for (let i = Math.floor(random() * 8); i >= 0; i--) add();
      let numbers: InstanceNumbers = NO_INSTANCE_NUMBERS;
      try {
        for (let pass = 0; pass < PASSES; pass++) {
          numbers = numberTokensInView(numbers, Object.values(tokens).map((t) => ({ id: t.id, art: t.imagePath, rank: t.instanceNumber ?? 1 })));
          for (const token of Object.values(tokens)) expect(numbers.numbers.get(token.id)?.number).toBe(token.instanceNumber);
          if (random() < 0.5) for (let i = 1 + Math.floor(random() * 3); i > 0; i--) add();
          else for (const id of Object.keys(tokens)) if (random() < 0.3) delete tokens[id];
        }
      } catch (error) {
        throw new Error(`seed ${seed}: ${String(error)}`);
      }
    }
  });
});
