import { FIELD_TYPES, type FieldType } from '../../../../src/app/statblocks/model/templateTypes';
import { coerce } from '../../../../src/app/statblocks/values/valueCoercion';
import { randomString, seededRandom } from '../expressions/seededRandom';

const SIZES = { options: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] };

describe('coerce by declared type', () => {
  it('clears the key for blank input of every type', () => {
    for (const type of FIELD_TYPES) {
      expect(coerce(type, ''), type).toEqual({ ok: true, value: undefined });
      expect(coerce(type, ' \n '), type).toEqual({ ok: true, value: undefined });
    }
  });

  it('reads numbers and keeps other text raw with a problem', () => {
    expect(coerce('number', '2.5')).toEqual({ ok: true, value: 2.5 });
    expect(coerce('number', ' -3 ')).toEqual({ ok: true, value: -3 });
    expect(coerce('number', '+3')).toEqual({ ok: true, value: 3 });
    expect(coerce('number', '−4')).toEqual({ ok: true, value: -4 });
    expect(coerce('number', '30 ft.')).toEqual({ ok: false, raw: '30 ft.', problem: '“30 ft.” isn\'t a number.' });
    expect(coerce('number', '1/4')).toMatchObject({ ok: false, raw: '1/4' });
    expect(coerce('number', '½')).toMatchObject({ ok: false, raw: '½' });
    expect(coerce('number', '3+1*')).toMatchObject({ ok: false, raw: '3+1*' });
  });

  it('keeps ratings as written and stores whole numbers as numbers', () => {
    expect(coerce('rating', '3')).toEqual({ ok: true, value: 3 });
    expect(coerce('rating', '-1')).toEqual({ ok: true, value: -1 });
    expect(coerce('rating', '1/4')).toEqual({ ok: true, value: '1/4' });
    expect(coerce('rating', '½')).toEqual({ ok: true, value: '½' });
    expect(coerce('rating', '3+1*')).toEqual({ ok: true, value: '3+1*' });
    expect(coerce('rating', 'Creature 3')).toEqual({ ok: true, value: 'Creature 3' });
    expect(coerce('rating', '2.5')).toEqual({ ok: true, value: '2.5' });
    expect(coerce('rating', 'boss')).toEqual({ ok: false, raw: 'boss', problem: '“boss” isn\'t a rating, like 3 or 1/4.' });
  });

  it('keeps readable dice notation as written and flags the rest', () => {
    for (const notation of ['7d10 + 14', '2d6+2', 'd20', '1d4 − 1', '2d6!']) {
      expect(coerce('dice', notation), notation).toEqual({ ok: true, value: notation });
    }
    expect(coerce('dice', '  2d6 ')).toEqual({ ok: true, value: '2d6' });
    expect(coerce('dice', '5')).toEqual({ ok: false, raw: '5', problem: '“5” rolls no dice, like 2d6 + 3.' });
    expect(coerce('dice', '2d6 x 10')).toEqual({ ok: false, raw: '2d6 x 10', problem: '“2d6 x 10” isn\'t dice, like 2d6 + 3.' });
  });

  it('matches choices in any case and returns the option as the template writes it', () => {
    expect(coerce('choice', 'large', SIZES)).toEqual({ ok: true, value: 'Large' });
    expect(coerce('choice', 'Swamp', SIZES)).toEqual({
      ok: false, raw: 'Swamp', problem: '“Swamp” isn\'t one of Tiny, Small, Medium, Large, Huge, Gargantuan.',
    });
    expect(coerce('choice', ' Swamp fey ', { ...SIZES, open: true })).toEqual({ ok: true, value: 'Swamp fey' });
    expect(coerce('choice', 'anything')).toEqual({ ok: true, value: 'anything' });
  });

  it('splits pasted lists', () => {
    expect(coerce('list', 'Common, Elvish\nDwarvish')).toEqual({ ok: true, value: ['Common', 'Elvish', 'Dwarvish'] });
    expect(coerce('list', ',')).toEqual({ ok: true, value: [] });
  });

  it('keeps text and markdown as typed', () => {
    expect(coerce('text', '  30 ft., swim 30 ft. ')).toEqual({ ok: true, value: '30 ft., swim 30 ft.' });
    expect(coerce('markdown', '  *Melee:* +6\n\nSecond paragraph.\n')).toEqual({ ok: true, value: '  *Melee:* +6\n\nSecond paragraph.' });
    expect(coerce('image', ' [[warden.webp]] ')).toEqual({ ok: true, value: '[[warden.webp]]' });
  });

  it('reads scores, pairs and spell lines', () => {
    expect(coerce('scores', '18, 8 15\n6')).toEqual({ ok: true, value: [18, 8, 15, 6] });
    // A table's slot may hold text: it is kept as typed, and commas part values that hold spaces.
    expect(coerce('scores', '18, —')).toEqual({ ok: true, value: [18, '—'] });
    expect(coerce('scores', '7 14, 1 per day; d8')).toEqual({ ok: true, value: [7, 14, '1 per day', 'd8'] });
    expect(coerce('pairs', 'Dex +5, Con: 3')).toEqual({ ok: true, value: [{ Dex: 5 }, { Con: 3 }] });
    expect(coerce('pairs', 'Dex +5, Darkvision')).toEqual({
      ok: false, raw: 'Dex +5, Darkvision', problem: '“Darkvision” isn\'t a name and a number, like Dex +5.',
    });
    expect(coerce('spells', 'At will: light\n\n1/day: fireball')).toEqual({ ok: true, value: ['At will: light', '1/day: fireball'] });
    expect(coerce('entries', 'Bite. 2d6')).toMatchObject({ ok: false, raw: 'Bite. 2d6' });
  });

  it('keeps text of a type from a newer template as typed', () => {
    expect(coerce('clock' as FieldType, ' 3 of 6 ')).toEqual({ ok: true, value: '3 of 6' });
  });

  it('never throws, and never changes what it cannot read', () => {
    const alphabet = '0123456789 ./+-−½*dDft,\n:abcLarge';
    for (let seed = 1; seed <= 600; seed++) {
      const input = randomString(seededRandom(seed), alphabet, 20);
      for (const type of FIELD_TYPES) {
        const result = coerce(type, input, SIZES);
        if (!result.ok) {
          expect(result.raw, `seed ${seed} ${type}`).toBe(input);
          expect(result.problem.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('takes an escaped comma as part of a label or word', () => {
    expect(coerce('pairs', 'Fire\\, cold: 3, Dex +2')).toEqual({ ok: true, value: [{ 'Fire, cold': 3 }, { Dex: 2 }] });
    expect(coerce('list', 'Fire\\, cold, Ice')).toEqual({ ok: true, value: ['Fire, cold', 'Ice'] });
  });
});
