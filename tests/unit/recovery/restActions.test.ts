import { describe, expect, it } from 'vitest';
import { parseRecoveryButton } from '../../../src/app/recovery/parseRecovery';
import { checkRest, restOffers, type PickRequest } from '../../../src/app/recovery/restOffer';
import { restOutcome } from '../../../src/app/recovery/restOutcome';
import { restPlan } from '../../../src/app/recovery/restPlan';
import { restSummaryText } from '../../../src/app/recovery/restSummary';
import type { RecoveryButton } from '../../../src/app/recovery/recoveryTypes';
import type { RestChoices } from '../../../src/app/recovery/restTypes';
import { character, roller } from './restFixtures';

const HP = { kind: 'resource', field: 'hp' } as const;
const STRESS = { kind: 'resource', field: 'stress' } as const;

/** A short rest as Daggerheart's runs: two downtime moves, the same one twice if wanted, wounds tended on anyone. */
const SHORT: RecoveryButton = {
  id: 'short',
  name: 'Short rest',
  rules: [],
  choices: [{
    id: 'moves',
    prompt: 'Choose two downtime moves',
    min: 2,
    max: 2,
    repeat: true,
    actions: [
      { id: 'wounds', name: 'Tend to Wounds', rules: [{ target: HP, does: 'amount', formula: '1d4+@tier' }], forOthers: true },
      { id: 'stress', name: 'Clear Stress', rules: [{ target: STRESS, does: 'amount', formula: '1d4+@tier' }] },
      { id: 'project', name: 'Work on a Project', text: 'Advance a project of yours.', rules: [] },
    ],
  }],
};

const mira = character({ resources: { hp: { current: 2, max: 10 }, stress: { current: 4, max: 6 } }, note: { tier: 2 } });
const kestrel = character({ resources: { hp: { current: 1, max: 8 }, stress: { current: 0, max: 6 } }, note: { tier: 9 } }, 'kestrel', 'Kestrel');
const allies = (id: string): typeof kestrel | null => (id === 'kestrel' ? kestrel : null);

function rest(picks: RestChoices['picks'], totals: number[]): ReturnType<typeof restOutcome> {
  return restOutcome(restPlan(SHORT, mira, picks, allies), mira, { picks, spends: new Map() }, roller(...totals));
}

describe('actions picked on a rest', () => {
  it('apply in the order picked, the same action twice where the step allows it', () => {
    const outcome = rest([{ choice: 'moves', action: 'stress', for: null }, { choice: 'moves', action: 'stress', for: null }], [2, 2]);
    expect(outcome.byCharacter.get('mira')?.resources.get('stress')).toEqual({ current: 0, max: 6 });
  });

  it('change the character an action is taken for, with the resting character\'s numbers', () => {
    const outcome = rest([{ choice: 'moves', action: 'wounds', for: 'kestrel' }, { choice: 'moves', action: 'project', for: null }], [5]);
    expect(outcome.byCharacter.get('kestrel')?.resources.get('hp')).toEqual({ current: 6, max: 8 });
    expect(outcome.byCharacter.has('mira')).toBe(false);
    expect(outcome.changes).toEqual([
      { character: { id: 'kestrel', name: 'Kestrel' }, target: { kind: 'resource', key: 'hp' }, label: 'HP', from: 1, to: 6, rolls: [{ formula: '1d4+(2)', total: 5 }] },
    ]);
  });

  it('skip an action taken for someone the rest cannot reach, and take one only meant for oneself for oneself', () => {
    expect(rest([{ choice: 'moves', action: 'wounds', for: 'stranger' }], []).skipped.map((each) => each.reason.kind)).toEqual(['unknown-ally']);
    const own = rest([{ choice: 'moves', action: 'stress', for: 'kestrel' }], [4]);
    expect(own.byCharacter.get('mira')?.resources.get('stress')?.current).toBe(0);
    expect(own.byCharacter.has('kestrel')).toBe(false);
  });

  it('say what was picked, and name another character\'s changes', () => {
    const outcome = rest([{ choice: 'moves', action: 'wounds', for: 'kestrel' }, { choice: 'moves', action: 'project', for: null }], [5]);
    expect(restSummaryText('Short rest', outcome.changes, outcome.skipped, { resting: 'mira', picks: ['Tend to Wounds', 'Work on a Project'] }))
      .toBe('Short rest (Tend to Wounds and Work on a Project): Kestrel: HP 1 → 6 (1d4+2)');
  });
});

describe('a request\'s picks, checked against the offer', () => {
  const offers = restOffers([SHORT], mira);
  const pick = (action: string, forId: string | null = null): PickRequest => ({ choice: 'moves', action, for: forId, spends: [] });
  const check = (picks: PickRequest[], offered = new Set(['kestrel'])): ReturnType<typeof checkRest> => checkRest(offers, { button: 'short', spends: [], picks }, offered);

  it('offer each step with its actions, what they say and whether they may be taken for another', () => {
    expect(offers[0]?.choices).toEqual([{
      id: 'moves', prompt: 'Choose two downtime moves', min: 2, max: 2, repeat: true,
      actions: [
        { id: 'wounds', name: 'Tend to Wounds', text: '', forOthers: true, spends: [] },
        { id: 'stress', name: 'Clear Stress', text: '', forOthers: false, spends: [] },
        { id: 'project', name: 'Work on a Project', text: 'Advance a project of yours.', forOthers: false, spends: [] },
      ],
    }]);
  });

  it('take exactly as many picks as the step asks, an action twice where it repeats, for an offered ally', () => {
    expect(check([pick('stress'), pick('stress')])?.choices.picks).toHaveLength(2);
    expect(check([pick('wounds', 'kestrel'), pick('project')])?.choices.picks[0]).toEqual({ choice: 'moves', action: 'wounds', for: 'kestrel' });
  });

  it('refuse too few or too many picks, an unknown action, someone not offered, and another for an action only for oneself', () => {
    expect(check([pick('stress')])).toBeNull();
    expect(check([pick('stress'), pick('stress'), pick('project')])).toBeNull();
    expect(check([pick('nap'), pick('stress')])).toBeNull();
    expect(check([pick('wounds', 'kestrel'), pick('stress')], new Set())).toBeNull();
    expect(check([pick('stress', 'kestrel'), pick('project')])).toBeNull();
    expect(checkRest(offers, { button: 'short', spends: [] })).toBeNull();
  });

  it('refuse an action twice where the step does not repeat', () => {
    const offer = offers.map((each) => ({ ...each, choices: each.choices.map((choice) => ({ ...choice, repeat: false })) }));
    expect(checkRest(offer, { button: 'short', spends: [], picks: [pick('stress'), pick('stress')] })).toBeNull();
    expect(checkRest(offer, { button: 'short', spends: [], picks: [pick('stress'), pick('project')] })).not.toBeNull();
  });
});

describe('steps as a collection stores them', () => {
  it('read back as written', () => {
    expect(parseRecoveryButton(JSON.parse(JSON.stringify(SHORT)))).toEqual(SHORT);
  });

  it('leave out a step whose counts do not read or ask more than it holds, and keep a button without steps as it was', () => {
    const step = SHORT.choices![0]!;
    const read = (choice: Record<string, unknown>): RecoveryButton['choices'] => parseRecoveryButton({ ...SHORT, choices: [choice] })?.choices;
    expect(read({ ...step, max: 0 })).toBeUndefined();
    expect(read({ ...step, min: 3, max: 2 })).toBeUndefined();
    expect(read({ ...step, repeat: false, min: 4, max: 4 })).toBeUndefined();
    expect(read({ ...step, actions: [] })).toBeUndefined();
    expect(read({ ...step, repeat: false, max: 6 })?.[0]?.max).toBe(3);
    expect(parseRecoveryButton({ id: 'long', name: 'Long rest', rules: [] })).toEqual({ id: 'long', name: 'Long rest', rules: [] });
  });
});
