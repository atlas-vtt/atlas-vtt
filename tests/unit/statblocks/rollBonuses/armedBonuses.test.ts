import { describe, expect, it, vi } from 'vitest';
import { ArmedBonuses } from '../../../../src/app/statblocks/rollBonuses/armedBonuses';
import { bonusId } from '../../../../src/app/statblocks/rollBonuses/armableValues';
import { armedValues, formulaLabel, withArmedBonuses } from '../../../../src/app/statblocks/rollBonuses/bonusFormula';
import { statblockBonusKey } from '../../../../src/app/statblocks/rollBonuses/rollBonusContext';
import { parseFormula } from '../../../../src/app/tools/parseFormula';

const PROFICIENCY = bonusId('proficiency');
const STEALTH = bonusId('experiences', 'Stealth');

describe('the armed values of an app', () => {
  it('are one store per app, a list per statblock, in the order they were armed', () => {
    const app = {};
    const store = ArmedBonuses.forApp(app);
    expect(ArmedBonuses.forApp(app)).toBe(store);
    expect(ArmedBonuses.forApp({})).not.toBe(store);
    store.toggle('note:Mira.md', STEALTH);
    store.toggle('note:Mira.md', PROFICIENCY);
    expect(store.armed('note:Mira.md')).toEqual([STEALTH, PROFICIENCY]);
    expect(store.armed('note:Goblin.md')).toEqual([]);
    expect(store.isArmed('note:Mira.md', STEALTH)).toBe(true);
    store.toggle('note:Mira.md', STEALTH);
    expect(store.armed('note:Mira.md')).toEqual([PROFICIENCY]);
  });

  it('tell only the listeners of the statblock that changed, and disarm what a roll took', () => {
    const store = ArmedBonuses.forApp({});
    const mira = vi.fn();
    const goblin = vi.fn();
    const stop = store.subscribe('mira', mira);
    store.subscribe('goblin', goblin);
    store.toggle('mira', PROFICIENCY);
    store.toggle('mira', STEALTH);
    const armed = store.armed('mira');
    store.spend('mira', [PROFICIENCY]);
    expect(store.armed('mira')).toEqual([STEALTH]);
    expect(armed).toEqual([PROFICIENCY, STEALTH]);
    store.spend('mira', [PROFICIENCY]);
    expect(mira).toHaveBeenCalledTimes(3);
    expect(goblin).not.toHaveBeenCalled();
    stop();
    store.toggle('mira', PROFICIENCY);
    expect(mira).toHaveBeenCalledTimes(3);
  });
});

describe('a statblock\'s key', () => {
  it('is its note, else its name, else the one card', () => {
    expect(statblockBonusKey('Party/Mira.md', 'Mira', 's1')).toBe('note:Party/Mira.md');
    expect(statblockBonusKey(undefined, 'Mira', 's1')).toBe('name:Mira');
    expect(statblockBonusKey(undefined, undefined, 's1')).toBe('sheet:s1');
  });
});

describe('a formula with armed values', () => {
  const shown = new Map([[PROFICIENCY, { label: 'Proficiency', value: 2 }], [STEALTH, { label: 'Stealth', value: 1 }]]);

  it('takes the armed values the card shows, in the order they were armed', () => {
    expect(armedValues([STEALTH, bonusId('gone'), PROFICIENCY], shown)).toEqual([
      { id: STEALTH, label: 'Stealth', value: 1 }, { id: PROFICIENCY, label: 'Proficiency', value: 2 },
    ]);
  });

  it('adds each as a labelled term', () => {
    const armed = armedValues([PROFICIENCY, STEALTH], shown);
    expect(withArmedBonuses('+5', armed)).toBe('+5+2[Proficiency]+1[Stealth]');
    expect(withArmedBonuses('2d6+3', [{ id: STEALTH, label: 'Stealth', value: -1 }])).toBe('2d6+3-1[Stealth]');
    expect(withArmedBonuses('1d20', [])).toBe('1d20');
  });

  it('writes a label as the formula can hold it', () => {
    expect(formulaLabel('Sleight of Hand (Dex)')).toBe('Sleight of Hand Dex');
    expect(formulaLabel('A very long experience name indeed')).toBe('A very long experience n');
    expect(formulaLabel('Übung')).toBe('Übung');
    expect(withArmedBonuses('+1', [{ id: STEALTH, label: '!!!', value: 1 }])).toBe('+1+1');
    for (const label of ['Sleight of Hand (Dex)', 'Wolf\'s-Bane', 'A very long experience name indeed']) {
      expect(parseFormula(withArmedBonuses('1d20', [{ id: STEALTH, label, value: 1 }])).ok).toBe(true);
    }
  });
});
