import { describe, expect, it } from 'vitest';
import { MAX_ROW_PLACES, parseDiceRow, parseGmMessage, parsePlayerMessage } from '../../../../src/app/online/protocol/index.ts';

const DESIGNED = { roll: { id: 'smite', name: 'Smite', formula: '+2', look: [{ count: 2, sides: 12, name: 'Hope', colour: '#e0b040' }] } };
const WRITTEN = { roll: { id: 'longsword', name: 'Longsword', formula: '1d8+3[slashing]' } };

describe('the GM\'s dice row as a page reads it', () => {
  it('keeps dice and saved rolls in their order', () => {
    expect(parseDiceRow([{ die: 20 }, DESIGNED, WRITTEN])).toEqual([{ die: 20 }, DESIGNED, WRITTEN]);
  });

  it('leaves out a place it cannot read, a later kind of place too, and reads no row that is no list or too long', () => {
    const bad = [
      { die: 1 }, { die: 1001 }, { die: 6.5 }, { cards: 52 },
      { roll: { ...WRITTEN.roll, name: ' ' } }, { roll: { ...WRITTEN.roll, name: 'a\u202eb' } }, { roll: { ...WRITTEN.roll, formula: '' } },
      { roll: { ...WRITTEN.roll, id: 'two words' } }, { roll: { ...WRITTEN.roll, formula: 'd'.repeat(101) } },
      { roll: { ...DESIGNED.roll, formula: '1d6' } }, { roll: { ...DESIGNED.roll, look: [] } },
      { roll: { ...DESIGNED.roll, look: [{ count: 101, sides: 6 }] } }, { roll: { ...DESIGNED.roll, look: [{ count: 1, sides: 6, colour: 'red' }] } },
    ];
    for (const place of bad) expect(parseDiceRow([place, { die: 8 }])).toEqual([{ die: 8 }]);
    expect(parseDiceRow({ die: 8 })).toBeUndefined();
    expect(parseDiceRow(Array.from({ length: MAX_ROW_PLACES + 1 }, () => ({ die: 6 })))).toBeUndefined();
  });

  it('reads the scene\'s rules without a row they hold none of, and a player\'s roll naming a saved roll by its id', () => {
    const rules = { t: 'rules', scene: 's1', grid: { type: 'square', size: 70, offsetX: 0, offsetY: 0 }, snap: true, accent: null, measurement: {
      mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 60,
    } };
    expect(parseGmMessage(rules)).not.toHaveProperty('diceRow');
    expect(parseGmMessage({ ...rules, diceRow: 'd20' })).not.toHaveProperty('diceRow');
    expect(parseGmMessage({ ...rules, diceRow: [{ die: 20 }] })).toMatchObject({ diceRow: [{ die: 20 }] });

    const roll = { t: 'roll', scene: 's1', formula: '2d12+2', token: null };
    expect(parsePlayerMessage({ ...roll, preset: 'smite' })).toEqual({ ...roll, preset: 'smite' });
    expect(parsePlayerMessage({ ...roll, preset: 'x'.repeat(65) })).toBeNull();
    expect(parsePlayerMessage({ ...roll, preset: 7 })).toBeNull();
  });
});
