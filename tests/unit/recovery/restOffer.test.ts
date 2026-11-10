import { describe, expect, it } from 'vitest';
import { checkRest, restOffers } from '../../../src/app/recovery/restOffer';
import { restSummaryText } from '../../../src/app/recovery/restSummary';
import type { RecoveryRule } from '../../../src/app/recovery/recoveryTypes';
import { button, character } from './restFixtures';

const HP = { kind: 'resource', field: 'hp' } as const;
const MIRA = { id: 'mira', name: 'Mira' };
const spendHitDice: RecoveryRule = { target: HP, does: 'spend', from: { kind: 'resource', field: 'hitDice' }, each: '1d8+@con', most: 2 };
const short = button([{ target: { kind: 'resource', field: 'stress' }, does: 'set', to: 0 }, spendHitDice], 'Short rest', 'short');
const long = button([{ target: HP, does: 'full' }]);
const state = character({ resources: { hp: { current: 3, max: 20 }, hitDice: { current: 1, max: 4 } }, note: { con: 1 } });

describe('restOffers', () => {
  it('offers every button with the Spend rules it can plan now', () => {
    expect(restOffers([short, long], state)).toEqual([
      { id: 'short', name: 'Short rest', spends: [{ rule: 1, label: 'Hit Dice', each: '1d8+(1)', max: 1 }], choices: [] },
      { id: 'long', name: 'Long rest', spends: [], choices: [] },
    ]);
  });
});

describe('checkRest', () => {
  const offers = restOffers([short, long], state);

  it('takes a request within the offer, naming each spend by its rule', () => {
    const checked = checkRest(offers, { button: 'short', spends: [1] });
    expect(checked?.button.id).toBe('short');
    expect([...checked!.choices.spends]).toEqual([['always:1', 1]]);
    expect(checkRest(offers, { button: 'long', spends: [] })?.button.id).toBe('long');
  });

  it('refuses an unknown button, another number of spends, and spends past the offer', () => {
    expect(checkRest(offers, { button: 'nap', spends: [] })).toBeNull();
    expect(checkRest(offers, { button: 'short', spends: [] })).toBeNull();
    expect(checkRest(offers, { button: 'short', spends: [2] })).toBeNull();
    expect(checkRest(offers, { button: 'short', spends: [-1] })).toBeNull();
    expect(checkRest(offers, { button: 'short', spends: [0.5] })).toBeNull();
  });
});

describe('restSummaryText', () => {
  it('lists the changes with their rolls, then what was skipped', () => {
    const changes = [
      { character: MIRA, target: { kind: 'resource', key: 'hp' }, label: 'HP', from: 4, to: 18, rolls: [{ formula: '2d8+2', total: 14 }] },
      { character: MIRA, target: { kind: 'counters', key: 'uses', row: 0 }, label: 'Wand', from: 0, to: 3, rolls: [] },
    ] as const;
    const skipped = [{ index: 2, ref: 'always:2', rule: long.rules[0]!, label: 'Stress', reason: { kind: 'no-value', key: 'stress' } }] as const;
    expect(restSummaryText('Long rest', changes, [])).toBe('Long rest: HP 4 → 18 (2d8+2) · Wand 0 → 3');
    expect(restSummaryText('Long rest', [], skipped)).toBe('Long rest: nothing to recover.\nSkipped: Stress (no open scene or played campaign holds it)');
  });
});
