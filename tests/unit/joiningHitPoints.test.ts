import { describe, expect, it } from 'vitest';
import { hitPointResource, rollHitDice, statblockHitDice, withRolledHitPoints } from '../../src/app/resources/joiningHitPoints';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { parseInitiativeRules, sameInitiativeRules, savedInitiativeRules } from '../../src/app/gameSystems/initiativeRules';
import { NO_MEANINGS } from '../../src/app/statblocks/resolve/fieldMeanings';

const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#cc3333', defeatedWhenSpent: true, visibleToPlayers: true };
const dice = (fields: Record<string, unknown>): string | null => statblockHitDice(fields, NO_MEANINGS, HP);

describe('the hit dice of a statblock', () => {
  it('are the dice written beside the hit points, the hit points written as dice, or the hit dice field', () => {
    expect(dice({ hp: '7 (2d6)' })).toBe('2d6');
    expect(dice({ hp: '45 (6d10 + 12)' })).toBe('6d10 + 12');
    expect(dice({ hp: '2d8+2' })).toBe('2d8+2');
    expect(dice({ hp: 7, hit_dice: '2d6' })).toBe('2d6');
    expect(dice({ 'Hit Points': '11 (2d8 + 2)' })).toBe('2d8 + 2');
  });

  it('are none where nothing reads as dice, so the statblock\'s own number stands', () => {
    expect(dice({ hp: 7 })).toBeNull();
    expect(dice({ hp: '7 (average)' })).toBeNull();
    expect(dice({ hp: '7', hit_dice: 'many' })).toBeNull();
    expect(dice({})).toBeNull();
  });

  it('belong to the resource that holds hit points, never a fixed value', () => {
    expect(hitPointResource([{ ...HP, key: 'ac', field: 'ac', direction: 'static' }, HP])).toBe(HP);
    expect(hitPointResource([{ ...HP, direction: 'static' }])).toBeUndefined();
  });

  it('roll at least 1, and their result is current and maximum, set by hand', () => {
    expect(rollHitDice('1d4-5', () => 0)).toBe(1);
    expect(rollHitDice('2d6', () => 0.99)).toBe(12);
    expect(rollHitDice('nonsense', () => 0)).toBeNull();
    expect(withRolledHitPoints({ resources: { hp: { current: 7, max: 7 } } }, 'hp', 9)).toEqual({ resources: { hp: { current: 9, max: 9 } }, overriddenMax: ['hp'] });
  });
});

describe('the rule that rolls them', () => {
  const rules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' } as const;

  it('is stored only where it is on and read only where it is true', () => {
    expect(parseInitiativeRules({ ...rules, rollHitPoints: true })?.rollHitPoints).toBe(true);
    expect(parseInitiativeRules({ ...rules, rollHitPoints: 'yes' })).not.toHaveProperty('rollHitPoints');
    expect(savedInitiativeRules({ ...rules, rollHitPoints: true })).toMatchObject({ rollHitPoints: true });
    expect(savedInitiativeRules({ ...rules })).not.toHaveProperty('rollHitPoints');
  });

  it('makes rules differ from the system\'s', () => {
    expect(sameInitiativeRules({ ...rules }, { ...rules, rollHitPoints: true })).toBe(false);
    expect(sameInitiativeRules({ ...rules }, { ...rules })).toBe(true);
  });
});
