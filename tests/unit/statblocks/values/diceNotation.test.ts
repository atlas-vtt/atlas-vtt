import { diceAverage, parseDiceNotation } from '../../../../src/app/statblocks/values/diceNotation';
import { pick, randomInt, randomString, seededRandom } from '../expressions/seededRandom';

describe('parseDiceNotation', () => {
  it('reads dice and constants with their signs', () => {
    expect(parseDiceNotation('7d10 + 14')).toEqual({ dice: [{ sign: 1, count: 7, sides: 10 }], modifier: 14 });
    expect(parseDiceNotation('d20')).toEqual({ dice: [{ sign: 1, count: 1, sides: 20 }], modifier: 0 });
    expect(parseDiceNotation('1d4 − 1')).toEqual({ dice: [{ sign: 1, count: 1, sides: 4 }], modifier: -1 });
    expect(parseDiceNotation('2D6 - 1d4 + 3 - 1')).toEqual({
      dice: [{ sign: 1, count: 2, sides: 6 }, { sign: -1, count: 1, sides: 4 }], modifier: 2,
    });
    expect(parseDiceNotation('-1d6+2')).toEqual({ dice: [{ sign: -1, count: 1, sides: 6 }], modifier: 2 });
    expect(parseDiceNotation('14')).toEqual({ dice: [], modifier: 14 });
    // The 5e SRD's data writes a negative modifier after a plus
    expect(parseDiceNotation('9d8 + -1')).toEqual({ dice: [{ sign: 1, count: 9, sides: 8 }], modifier: -1 });
  });

  it('reads one pair of brackets around the whole as punctuation', () => {
    expect(parseDiceNotation('(2d6 + 3)')).toEqual({ dice: [{ sign: 1, count: 2, sides: 6 }], modifier: 3 });
    expect(parseDiceNotation(' ( d8 ) ')).toEqual({ dice: [{ sign: 1, count: 1, sides: 8 }], modifier: 0 });
    expect(diceAverage('(7d10 + 14)')).toBe(52);
    for (const text of ['(2d6', '2d6)', '(1d6) + (1d4)', '((2d6))', '45 (7d10 + 7)']) expect(parseDiceNotation(text), text).toBeNull();
  });

  it('reads the exploding marks the dice tool rolls', () => {
    for (const text of ['2d6!', '1d6!!', '1d6!i', '2d6!3 + 1']) expect(parseDiceNotation(text), text).not.toBeNull();
  });

  it.each([
    [''], ['  '], ['2d'], ['d'], ['2d6 3'], ['2d6 +'], ['+'], ['2d6 x 10'], ['2 d 6'], ['0d6'], ['2d1'], ['2d0'], ['d%'],
    ['7d10 + 14 slashing'], ['2d6++1'], ['--1'], ['2d6!x'], ['99999999999999999999d6'],
  ])('%j is not notation', (text) => {
    expect(parseDiceNotation(text)).toBeNull();
  });
});

describe('diceAverage', () => {
  it.each([
    ['7d10 + 14', 52],
    ['2d6+2', 9],
    ['d20', 10],
    ['1d4 − 1', 1],
    ['1d4 - 5', -3],
    ['2d6 - 1d4', 4],
    ['14', 14],
    ['1d2 - 1', 0],
  ])('%s averages %d', (text, expected) => {
    expect(diceAverage(text)).toBe(expected);
  });

  it('has no average for text that is not notation', () => {
    expect(diceAverage('lots')).toBeNull();
  });

  it('averages generated notation like the sum of its terms', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const random = seededRandom(seed);
      const terms = Array.from({ length: randomInt(random, 1, 4) }, () => {
        const sign = pick(random, [1, -1] as const);
        return random() < 0.7
          ? { sign, count: randomInt(random, 1, 12), sides: pick(random, [2, 4, 6, 8, 10, 12, 20, 100]) }
          : { sign, constant: randomInt(random, 0, 30) };
      });
      const text = terms.map((term, index) => {
        const sign = term.sign < 0 ? pick(random, ['-', '−', ' - ']) : index === 0 ? '' : pick(random, ['+', ' + ']);
        return 'constant' in term ? `${sign}${term.constant}` : `${sign}${term.count}d${term.sides}`;
      }).join('');
      const exact = terms.reduce((sum, term) => sum + term.sign * ('constant' in term ? term.constant : term.count * (term.sides + 1) / 2), 0);
      expect(diceAverage(text), `seed ${seed}: ${text}`).toBe(Math.floor(exact) === 0 ? 0 : Math.floor(exact));
    }
  });

  it('never throws on random text', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const text = randomString(seededRandom(seed), '0123456789dD+-− !i%x', 16);
      const average = diceAverage(text);
      expect(average === null || Number.isInteger(average), `seed ${seed}: ${text}`).toBe(true);
    }
  });
});
