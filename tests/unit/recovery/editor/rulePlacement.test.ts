import { describe, expect, it } from 'vitest';
import { BADGE_RISE, placeRuleCard, RULE_GAP } from '../../../../src/app/statblocks/editor/rests/rulePlacement';

const FRAME = { left: 0, top: 0, right: 800, bottom: 900 };
const ROW = { left: 10, top: 400, right: 780, bottom: 430 };

describe('where the rule card hangs', () => {
  it('under the row, from its left edge', () => {
    expect(placeRuleCard(344, 200, ROW, FRAME)).toEqual({ left: 10, side: 'below', edge: 430 + RULE_GAP });
  });

  it('inside the stage\'s sides, for a metric near its right edge', () => {
    const chip = { left: 600, top: 400, right: 680, bottom: 426 };
    expect(placeRuleCard(344, 200, chip, FRAME).left).toBe(800 - RULE_GAP - 344);
  });

  it('over the row and its badge where the stage has no room below, never on it', () => {
    const low = { ...ROW, top: 800, bottom: 830 };
    expect(placeRuleCard(344, 200, low, FRAME)).toEqual({ left: 10, side: 'above', edge: 800 - BADGE_RISE - RULE_GAP });
  });

  it('keeps its side while it fits there, and leaves it where it no longer does', () => {
    const middle = { ...ROW, top: 600, bottom: 630 };
    expect(placeRuleCard(344, 200, middle, FRAME, 'above').side).toBe('above');
    expect(placeRuleCard(344, 200, middle, FRAME).side).toBe('below');
    const high = { ...ROW, top: 100, bottom: 130 };
    expect(placeRuleCard(344, 200, high, FRAME, 'above').side).toBe('below');
  });

  it('hangs below where it fits neither side', () => {
    expect(placeRuleCard(344, 880, ROW, FRAME).side).toBe('below');
  });
});
