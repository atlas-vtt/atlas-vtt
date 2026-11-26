import { describe, expect, it } from 'vitest';
import type { FieldValue, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { restoreCounters, restoresRow, type RegainRoll } from '../../../../src/app/statblocks/values/counterRestore';
import { readCounterRows, shownCounterRows, withCounterReset, withCountersSet, withCounterUsed } from '../../../../src/app/statblocks/values/counterValues';
import { valueMisfit } from '../../../../src/app/statblocks/values/valueFit';

const FIELD: TemplateField = {
  key: 'slots', label: 'Spell slots', type: 'counters',
  counterRows: [{ name: '1st level', max: 2 }, { name: '2nd level', max: 0, regain: '1d4' }],
};
const CHARGES: TemplateField = { key: 'charges', label: 'Charges', type: 'counters' };

const never: RegainRoll = () => {
  throw new Error('nothing regains a formula here');
};

describe('a Counters value', () => {
  it('shows the rows a template gained after the note stored its own, after the note\'s, none used', () => {
    const insight: TemplateField = { key: 'insight', label: 'Insight', type: 'counters', counterRows: [{ name: 'XP', max: 6 }, { name: 'Device', max: 4 }, { name: 'Doctor', max: 0 }] };
    const stored = [{ name: 'xp ', max: 6, used: 6 }];
    expect(shownCounterRows(insight, stored)).toEqual([
      { name: 'xp ', max: 6, used: 6, reset: null, regain: null },
      { name: 'Device', max: 4, used: 0, reset: null, regain: null },
    ]);
    expect(withCounterUsed(insight, stored, 1, 1)).toEqual([{ name: 'xp ', max: 6, used: 6, templateMax: 6 }, { name: 'Device', max: 4, used: 1, templateMax: 4 }]);
  });

  it('shows a row the template renamed once, as the note names it, and writes no copy of it', () => {
    const renamed: TemplateField = { key: 'slots', label: 'Spell slots', type: 'counters', counterRows: [{ name: 'Level 1', max: 2 }, { name: 'Level 2', max: 2 }] };
    const stored = [{ name: '1st', max: 2, used: 1 }];
    expect(shownCounterRows(renamed, stored)?.map((row) => row.name)).toEqual(['1st', 'Level 2']);
    expect(withCounterUsed(renamed, stored, 0, 2)).toEqual([{ name: '1st', max: 2, used: 2, templateMax: 2 }, { name: 'Level 2', max: 2, used: 0, templateMax: 2 }]);
    // A row the note holds by name is not taken for the renamed one at its place
    const both = [{ name: 'Level 2', max: 2, used: 0 }];
    expect(shownCounterRows(renamed, both)?.map((row) => row.name)).toEqual(['Level 2', 'Level 1']);
  });

  it('keeps a row the template no longer defines, and adds nothing to a value that is no list of counters', () => {
    expect(shownCounterRows(CHARGES, [{ name: 'Wand', max: 7 }])?.map((row) => row.name)).toEqual(['Wand']);
    expect(shownCounterRows(FIELD, [{ name: 'Ki', max: 2, used: 5 }])).toBeNull();
  });

  it('reads rows, a missing used as none, their recovery button and formula as written', () => {
    expect(readCounterRows([{ name: 'Ki', max: 3 }, { name: 'Wand', max: 7, used: 1, reset: 'dawn', regain: '1d6+1' }])).toEqual([
      { name: 'Ki', max: 3, used: 0, reset: null, regain: null },
      { name: 'Wand', max: 7, used: 1, reset: 'dawn', regain: '1d6+1' },
    ]);
  });

  it('clamps nothing: a row used past its maximum, a broken maximum, a reset that is no text or a regain that is no formula makes the value a misfit', () => {
    const misfits = [
      [{ name: 'Ki', max: 2, used: 3 }], [{ name: 'Ki', max: 1.5 }], [{ name: 'Ki', max: 1, reset: 3 }],
      [{ name: 'Ki', max: 1, reset: 'dawn', regain: 'lots' }], [{ name: 'Ki', max: 1, regain: '3' }], 'four',
    ];
    for (const value of misfits) {
      expect(readCounterRows(value)).toBeNull();
      expect(valueMisfit(FIELD, value)?.label).toBe('Not counters');
    }
    // A row's recovery button is the character's choice: any id fits
    expect(valueMisfit(FIELD, [{ name: 'Ki', max: 2, used: 1, reset: 'whatever-button' }])).toBeNull();
  });

  it('shows the preset rows while the note holds none, with no recovery button chosen', () => {
    expect(shownCounterRows(FIELD, undefined)).toEqual([
      { name: '1st level', max: 2, used: 0, reset: null, regain: null },
      { name: '2nd level', max: 0, used: 0, reset: null, regain: '1d4' },
    ]);
  });

  it('changes one row\'s uses, keeping the rest of each row; a note without rows gets the preset rows', () => {
    expect(withCounterUsed(CHARGES, [{ name: 'Ki', max: 3, used: 0, reset: 'short', colour: 'red' }], 0, 2)).toEqual([{ name: 'Ki', max: 3, used: 2, reset: 'short', colour: 'red' }]);
    expect(withCounterUsed(FIELD, undefined, 0, 1)).toEqual([
      { name: '1st level', max: 2, used: 1, templateMax: 2 },
      { name: '2nd level', max: 0, used: 0, regain: '1d4', templateMax: 0 },
    ]);
    expect(withCounterUsed(FIELD, [{ name: 'Ki', max: 3, used: 3 }], 0, 3)).toBeNull();
    expect(withCounterUsed(FIELD, [{ name: 'Ki', max: 3, used: 3 }], 1, 0)).toBeNull();
  });

  it('names or clears the recovery button that gives a row its uses back, keeping the rest of the row', () => {
    expect(withCounterReset(CHARGES, [{ name: 'Ki', max: 3, used: 1, colour: 'red' }], 0, 'short')).toEqual([{ name: 'Ki', max: 3, used: 1, reset: 'short', colour: 'red' }]);
    expect(withCounterReset(CHARGES, [{ name: 'Ki', max: 3, reset: 'short' }], 0, null)).toEqual([{ name: 'Ki', max: 3, used: 0 }]);
    expect(withCounterReset(FIELD, [{ name: 'Ki', max: 3, reset: 'short' }], 0, 'short')).toBeNull();
    expect(withCounterReset(FIELD, [{ name: 'Ki', max: 3 }], 4, 'short')).toBeNull();
  });
});

describe('a Counters row and its template\'s maximum', () => {
  const ki = (max: number, name = 'Ki'): TemplateField => ({ key: 'ki', label: 'Ki', type: 'counters', counterRows: [{ name, max }] });
  const drawn = (field: TemplateField, value: FieldValue | null): unknown => shownCounterRows(field, value ?? undefined)?.map(({ name, max, used }) => ({ name, max, used }));

  it('stores a row with the template\'s maximum as taken from it, and reads the template\'s as it is now, more or fewer', () => {
    const stored = withCounterUsed(ki(3), undefined, 0, 1);
    expect(stored).toEqual([{ name: 'Ki', max: 3, used: 1, templateMax: 3 }]);
    expect(drawn(ki(5), stored)).toEqual([{ name: 'Ki', max: 5, used: 1 }]);
    // Fewer uses than were spent: none are left, and the note is as it was until its next change
    const spent = [{ name: 'Ki', max: 3, used: 3, templateMax: 3, colour: 'red' }];
    expect(drawn(ki(2), spent)).toEqual([{ name: 'Ki', max: 2, used: 2 }]);
    expect(withCounterUsed(ki(2), spent, 0, 2)).toBeNull();
    expect(withCounterUsed(ki(2), spent, 0, 1)).toEqual([{ name: 'Ki', max: 2, used: 1, templateMax: 2, colour: 'red' }]);
    expect(withCounterReset(ki(5), spent, 0, 'short')).toEqual([{ name: 'Ki', max: 5, used: 3, reset: 'short', templateMax: 5, colour: 'red' }]);
  });

  it('follows the template\'s maximum of a row the template renamed', () => {
    expect(drawn(ki(6, 'Focus'), [{ name: 'Ki', max: 3, used: 1, templateMax: 3 }])).toEqual([{ name: 'Ki', max: 6, used: 1 }]);
  });

  it('keeps a maximum of the note\'s own: one written without the template\'s, or changed since it was taken', () => {
    expect(drawn(ki(3), [{ name: 'Ki', max: 4, used: 1 }])).toEqual([{ name: 'Ki', max: 4, used: 1 }]);
    expect(drawn(ki(5), [{ name: 'Ki', max: 3, used: 1 }])).toEqual([{ name: 'Ki', max: 3, used: 1 }]);
    const byHand = [{ name: 'Ki', max: 6, used: 1, templateMax: 3 }];
    expect(drawn(ki(5), byHand)).toEqual([{ name: 'Ki', max: 6, used: 1 }]);
    expect(withCounterUsed(ki(5), byHand, 0, 2)).toEqual([{ name: 'Ki', max: 6, used: 2 }]);
    // A row of no template row has no maximum to take
    expect(withCounterUsed(CHARGES, [{ name: 'Wand', max: 7, used: 0, templateMax: 7 }], 0, 1)).toEqual([{ name: 'Wand', max: 7, used: 1 }]);
  });

  it('takes a stored maximum equal to the template\'s for the template\'s with the note\'s next change', () => {
    const stored = withCounterUsed(ki(3), [{ name: 'Ki', max: 3, used: 0 }], 0, 1);
    expect(stored).toEqual([{ name: 'Ki', max: 3, used: 1, templateMax: 3 }]);
    expect(drawn(ki(5), stored)).toEqual([{ name: 'Ki', max: 5, used: 1 }]);
  });

  it('makes a maximum set for the note its own, until it is set to the template\'s again', () => {
    const follows = [{ name: 'Ki', max: 3, used: 1, templateMax: 3 }];
    const own = withCountersSet(ki(3), follows, [{ max: 4, used: 1 }]);
    expect(own).toEqual([{ name: 'Ki', max: 4, used: 1 }]);
    expect(drawn(ki(5), own)).toEqual([{ name: 'Ki', max: 4, used: 1 }]);
    expect(withCountersSet(ki(5), own ?? undefined, [{ max: 5, used: 1 }])).toEqual([{ name: 'Ki', max: 5, used: 1, templateMax: 5 }]);
  });
});

describe('counters restored by a recovery button', () => {
  const OWN_ROWS: TemplateField = { key: 'slots', label: 'Spell slots', type: 'counters' };
  const slots = [
    { name: 'Ki', max: 3, used: 2, reset: 'short' },
    { name: 'Slots', max: 2, used: 2, reset: 'long' },
    { name: 'Wish', max: 1, used: 1 },
  ];
  const charges = [{ name: 'Wand', max: 7, used: 6, reset: 'dawn', regain: '1d6+1' }];
  const targets = [{ field: OWN_ROWS, value: slots }, { field: CHARGES, value: charges }];

  it('restores the rows whose button the rule names, or every row', () => {
    expect(restoreCounters(targets, ['short'], never, 'Short rest')).toEqual([{ field: OWN_ROWS, base: slots, next: [{ ...slots[0], used: 0 }, slots[1], slots[2]] }]);
    expect(restoreCounters(targets, ['short', 'long'], never, 'Long rest')?.[0]?.next).toEqual([{ ...slots[0], used: 0 }, { ...slots[1], used: 0 }, slots[2]]);
    expect(restoreCounters([targets[0]!], 'all', never, 'Long rest')?.[0]?.next).toEqual(slots.map((row) => ({ ...row, used: 0 })));
    expect(restoresRow('all', { reset: null })).toBe(true);
    expect(restoresRow(['long'], { reset: null })).toBe(false);
  });

  it('rolls what a row regains, named by the row and the rest, and keeps its uses within none used', () => {
    const rolled: string[] = [];
    const roll = (total: number): RegainRoll => (formula, flavor) => {
      rolled.push(`${formula} ${flavor}`);
      return total;
    };
    expect(restoreCounters(targets, ['dawn'], roll(4), 'Dawn')).toEqual([{ field: CHARGES, base: charges, next: [{ ...charges[0], used: 2 }] }]);
    expect(rolled).toEqual(['1d6+1 Wand (Dawn)']);
    expect(restoreCounters(targets, ['dawn'], roll(9), 'Dawn')?.[0]?.next).toEqual([{ ...charges[0], used: 0 }]);
    expect(restoreCounters(targets, ['dawn'], roll(-2), 'Dawn')).toEqual([]);
  });

  it('refuses the whole restore where a roll was not made', () => {
    expect(restoreCounters(targets, ['dawn'], () => null, 'Dawn')).toBeNull();
  });

  it('gives back nothing where nothing is used or named, and leaves a field that is no list of counters alone', () => {
    const rested = [{ field: OWN_ROWS, value: [{ ...slots[0], used: 0 }] }, { field: CHARGES, value: 'broken' }];
    expect(restoreCounters(rested, 'all', never, 'Long rest')).toEqual([]);
    expect(restoreCounters(targets, ['session'], never, 'Session')).toEqual([]);
  });
});
