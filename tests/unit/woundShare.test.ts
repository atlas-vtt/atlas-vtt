import { describe, expect, it } from 'vitest';
import { woundShare } from '../../src/app/initiative/woundShare';

const drains = { direction: 'drains' as const };

describe('the share of its life a combatant lost', () => {
  it('reads a draining resource from what is left, a filling one from what is used, and the furthest spent of several', () => {
    expect(woundShare([{ definition: drains, value: { current: 6, max: 8 } }])).toBe(0.25);
    expect(woundShare([{ definition: { direction: 'fills' }, value: { current: 3, max: 4 } }])).toBe(0.75);
    expect(woundShare([
      { definition: drains, value: { current: 9, max: 10 } },
      { definition: drains, value: { current: 1, max: 4 } },
    ])).toBe(0.75);
  });

  it('stays between 0 and 1, and tells nothing without a resource that counts', () => {
    expect(woundShare([{ definition: drains, value: { current: 12, max: 8 } }])).toBe(0);
    expect(woundShare([{ definition: drains, value: { current: -3, max: 8 } }])).toBe(1);
    expect(woundShare([{ definition: drains, value: { current: 0, max: 0 } }])).toBeNull();
    expect(woundShare([{ definition: { direction: 'static' }, value: { current: 15, max: 15 } }])).toBeNull();
    expect(woundShare([])).toBeNull();
  });
});
