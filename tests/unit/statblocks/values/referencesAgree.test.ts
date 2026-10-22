import { describe, expect, it } from 'vitest';
import { referencesAgree } from '../../../../src/app/statblocks/values/diceValues';
import { keysRead, statblockLookup, tracedStatblockLookup } from '../../../../src/app/statblocks/values/statblockLookup';
import { TEMPLATE_FORMAT, type StatblockTemplate, type TemplateField } from '../../../../src/app/statblocks/model/templateTypes';

const FIELDS: TemplateField[] = [
  { key: 'x', label: 'Secret', type: 'number' },
  { key: 'X_', label: 'Shown', type: 'number' },
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'hd', label: 'Hit die', type: 'dice' },
];
const TEMPLATE: StatblockTemplate = { format: TEMPLATE_FORMAT, version: 1, id: 'agree-abc123', fields: FIELDS, layout: { maxColumns: 1, columnWidth: 22, blocks: [] } };
// The same number under the hidden field and the shown one that is read by its name where the hidden one is missing
const WHOLE = { x: 2, X_: 2, level: 3, hd: '1d8+@level' };
const SHOWN = { X_: 2, level: 3, hd: '1d8+@level' };
const seen = tracedStatblockLookup(TEMPLATE, SHOWN);
const all = tracedStatblockLookup(TEMPLATE, WHOLE);

describe('referencesAgree', () => {
  it('refuses a name each lookup reads from another field, though both read the same number', () => {
    expect(seen('x').value).toBe(2);
    expect(all('x').value).toBe(2);
    expect(referencesAgree('1d8+@x', seen, all)).toBe(false);
  });

  it('takes references that read the same field in both, values that name references themselves too', () => {
    expect(referencesAgree('1d8+@level', seen, all)).toBe(true);
    expect(referencesAgree('@hd and @shown', seen, all)).toBe(true);
    expect(referencesAgree('Ask @DM', seen, all)).toBe(true);
  });

  it('answers as the plain lookup does', () => {
    for (const path of ['x', 'level', 'hd', 'shown', 'nope']) expect(all(path).value).toEqual(statblockLookup(TEMPLATE, WHOLE)(path));
  });

  it('says which keys an answer read, and where it was cut short', () => {
    expect(keysRead(seen('shown').trace)).toEqual(['X_']);
    expect(seen('hd').exhausted).toBe(false);
    const chain = { level: '@hd', hd: '@level' };
    const circle = tracedStatblockLookup(TEMPLATE, chain);
    expect(circle('level').exhausted).toBe(true);
    expect(referencesAgree('@level', circle, circle)).toBe(false);
  });
});
