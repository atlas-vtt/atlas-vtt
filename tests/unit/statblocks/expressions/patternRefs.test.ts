import { describe, expect, it } from 'vitest';
import { patternRefs } from '../../../../src/app/statblocks/expressions/patternRefs';
import { fieldsShownBy } from '../../../../src/app/statblocks/model/treeQueries';

describe('patternRefs', () => {
  it('names the fields of values, optional parts and formulas once, in order', () => {
    expect(patternRefs('{size} {type}[ ({subtype})][, {alignment}]')).toEqual(['size', 'type', 'subtype', 'alignment']);
    expect(patternRefs('{damage_immunities, condition_immunities|join:; }')).toEqual(['damage_immunities', 'condition_immunities']);
    expect(patternRefs('{hp}[ ({hit_dice})] {hp|signed}')).toEqual(['hp', 'hit_dice']);
  });

  it('reads the key of an indexed reference and the fields a formula reads', () => {
    expect(patternRefs('{=floor((stats.1 - 10) / 2)|signed} ({=max(ac, -level) + 10})')).toEqual(['stats', 'ac', 'level']);
  });

  it('names nothing for text, the Scores slot, or a pattern that cannot be read', () => {
    expect(patternRefs('None')).toEqual([]);
    expect(patternRefs('{=value * 2}')).toEqual([]);
    expect(patternRefs('{hp')).toEqual([]);
  });

  it('serves as the refsOf of fieldsShownBy', () => {
    const block = { id: 'b', type: 'stat', field: 'damage_immunities', look: 'run-in', pattern: '{damage_immunities, condition_immunities|join:; }' } as const;
    expect(fieldsShownBy(block, patternRefs)).toEqual(['damage_immunities', 'condition_immunities']);
  });
});
