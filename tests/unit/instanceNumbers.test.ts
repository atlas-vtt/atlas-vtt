import { describe, expect, it } from 'vitest';
import {
  NO_INSTANCE_NUMBERS,
  badgeNumberInView,
  numberTokensInView,
  type InstanceNumbers,
  type TokenInView,
} from '../../src/app/vision/instanceNumbers';

const goblin = (id: string, rank = 1): TokenInView => ({ id, art: 'goblin.png', rank });
const orc = (id: string, rank = 1): TokenInView => ({ id, art: 'orc.png', rank });

/** Numbers each pass in turn; returns the numbers of every pass, as `id: number` per token in view. */
function passes(...inViews: TokenInView[][]): Record<string, number>[] {
  let numbers: InstanceNumbers = NO_INSTANCE_NUMBERS;
  return inViews.map((inView) => {
    numbers = numberTokensInView(numbers, inView);
    return Object.fromEntries([...numbers.numbers].map(([id, { number }]) => [id, number]));
  });
}

describe('numberTokensInView', () => {
  it('numbers the tokens of one art from 1, in the order of their ranks, then of the list', () => {
    expect(passes([goblin('a', 3), goblin('b', 1), goblin('c', 2), orc('d', 7)])).toEqual([{ a: 3, b: 1, c: 2, d: 1 }]);
    expect(passes([goblin('a', 1), goblin('b', 1), goblin('c', 1)])).toEqual([{ a: 1, b: 2, c: 3 }]);
    expect(passes([goblin('a', Number.NaN), goblin('b', 5), goblin('c', Number.POSITIVE_INFINITY), goblin('d', 2)]))
      .toEqual([{ b: 2, d: 1, a: 3, c: 4 }]);
  });

  it('lets a token keep its number while it stays in view, and gives a newcomer the smallest number free', () => {
    expect(passes(
      [goblin('a', 1), goblin('b', 2), goblin('c', 3)],
      [goblin('a', 1), goblin('c', 3)],
      [goblin('a', 1), goblin('c', 3), goblin('d', 4)],
      [goblin('c', 3), goblin('d', 4), goblin('e', 1), goblin('b', 2)],
    )).toEqual([
      { a: 1, b: 2, c: 3 },
      { a: 1, c: 3 },
      { a: 1, c: 3, d: 2 },
      { c: 3, d: 2, e: 1, b: 4 },
    ]);
  });

  it('counts only the tokens in view, so a token left out holds no number', () => {
    // Goblins 1 and 3 in view, 2 not: the players see 1 and 2.
    expect(passes([goblin('a', 1), goblin('c', 3)])).toEqual([{ a: 1, c: 2 }]);
  });

  it('treats a change of art as leaving one group and coming into the other', () => {
    expect(passes(
      [goblin('g1', 1), goblin('g2', 2), orc('o1', 1), orc('o2', 2)],
      [goblin('g1', 1), orc('g2', 2), orc('o1', 1), orc('o2', 2)],
    )).toEqual([
      { g1: 1, g2: 2, o1: 1, o2: 2 },
      { g1: 1, g2: 3, o1: 1, o2: 2 },
    ]);
  });

  it('keeps tokens without art in one group', () => {
    expect(passes([{ id: 'a', art: '', rank: 1 }, { id: 'b', art: '', rank: 1 }, goblin('c')])).toEqual([{ a: 1, b: 2, c: 1 }]);
  });

  it('keeps the first entry of an id listed twice', () => {
    const numbers = numberTokensInView(NO_INSTANCE_NUMBERS, [goblin('a', 2), orc('a', 1), goblin('b', 1)]);
    expect(numbers.numbers.get('a')).toEqual({ art: 'goblin.png', number: 2 });
    expect(numbers.counts.get('goblin.png')).toBe(2);
    expect(numbers.counts.get('orc.png')).toBeUndefined();
  });

  it('returns the previous numbers themselves while the same tokens with the same art are in view', () => {
    const first = numberTokensInView(NO_INSTANCE_NUMBERS, [goblin('a', 1), goblin('b', 2)]);
    expect(numberTokensInView(first, [goblin('b', 9), goblin('a', 4)])).toBe(first);
    expect(numberTokensInView(first, [goblin('a', 1)])).not.toBe(first);
    expect(numberTokensInView(first, [goblin('a', 1), orc('b', 2)])).not.toBe(first);
    expect(numberTokensInView(NO_INSTANCE_NUMBERS, [])).toBe(NO_INSTANCE_NUMBERS);
  });

  it('counts the tokens in view per art', () => {
    const numbers = numberTokensInView(NO_INSTANCE_NUMBERS, [goblin('a'), goblin('b'), orc('c')]);
    expect([...numbers.counts]).toEqual([['goblin.png', 2], ['orc.png', 1]]);
  });
});

describe('a token that was only sensed in between', () => {
  it('comes back as a newcomer: seen, sensed, then seen again behind a goblin that came into view meanwhile', () => {
    // A and B seen; B only sensed (left out of the view); C comes into view; B is seen again.
    expect(passes(
      [goblin('A', 1), goblin('B', 2)],
      [goblin('A', 1)],
      [goblin('A', 1), goblin('C', 3)],
      [goblin('A', 1), goblin('C', 3), goblin('B', 2)],
    )).toEqual([
      { A: 1, B: 2 },
      { A: 1 },
      { A: 1, C: 2 },
      { A: 1, C: 2, B: 3 },
    ]);
  });

  it('takes its old number again when nothing took it meanwhile', () => {
    expect(passes(
      [goblin('A', 1), goblin('B', 2), goblin('C', 3)],
      [goblin('A', 1), goblin('C', 3)],
      [goblin('A', 1), goblin('C', 3), goblin('B', 2)],
    )).toEqual([
      { A: 1, B: 2, C: 3 },
      { A: 1, C: 3 },
      { A: 1, C: 3, B: 2 },
    ]);
  });
});

describe('badgeNumberInView', () => {
  const numbers = numberTokensInView(NO_INSTANCE_NUMBERS, [goblin('a', 1), goblin('b', 2), orc('c', 1)]);

  it('gives the number while badges are on and two or more tokens of the art are in view', () => {
    expect(badgeNumberInView(numbers, 'a', true)).toBe(1);
    expect(badgeNumberInView(numbers, 'b', true)).toBe(2);
  });

  it('gives none to a token alone with its art, to one not in view, and while badges are off', () => {
    expect(badgeNumberInView(numbers, 'c', true)).toBeNull();
    expect(badgeNumberInView(numbers, 'missing', true)).toBeNull();
    expect(badgeNumberInView(numbers, 'a', false)).toBeNull();
  });
});
