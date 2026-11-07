import { describe, expect, it } from 'vitest';
import {
  clampedPicks, mostPicks, pickMode, withActionChanged, withActionName, withActionText, withAddedAction, withAddedChoice,
  withChoiceChanged, withForOthers, withoutAction, withoutChoice, withPicks, withPrompt, withRepeat,
} from '../../../../src/app/recovery/editor/recoveryChoiceEdits';
import { ruleFor, withoutButton, withoutRule, withRule } from '../../../../src/app/recovery/editor/recoveryEdits';
import { ALWAYS, resolveScope, rulesOf, scopeName, withScopeRules, type RuleScope } from '../../../../src/app/recovery/editor/recoveryScope';
import { parseRecoveryButton } from '../../../../src/app/recovery/parseRecovery';
import {
  MAX_ACTION_PICKS, MAX_RECOVERY_ACTIONS, MAX_RECOVERY_CHOICES, MAX_RECOVERY_RULES,
  type RecoveryButton, type RecoveryChoice, type RecoveryRule,
} from '../../../../src/app/recovery/recoveryTypes';

const HP = { kind: 'resource', field: 'hp' } as const;
const STRESS = { kind: 'resource', field: 'stress' } as const;

const DOWNTIME: RecoveryChoice = {
  id: 'step-a', prompt: 'Choose two downtime moves', min: 2, max: 2,
  actions: [
    { id: 'act-tend', name: 'Tend to Wounds', rules: [{ target: HP, does: 'amount', formula: '1d4' }], forOthers: true },
    { id: 'act-clear', name: 'Clear Stress', rules: [{ target: STRESS, does: 'amount', formula: '1d4' }] },
    { id: 'act-project', name: 'Work on a Project', rules: [] },
  ],
};
const REST: RecoveryButton = { id: 'rest-short1', name: 'Short rest', rules: [{ target: HP, does: 'full' }], choices: [DOWNTIME] };
const TEND: RuleScope = { kind: 'action', choice: 'step-a', action: 'act-tend' };

/** A button as `parseRecovery` reads it back from a file. */
const reread = (button: RecoveryButton): RecoveryButton | undefined => parseRecoveryButton(JSON.parse(JSON.stringify(button)));

describe('scopes', () => {
  it('read and write the button\'s own rules or one action\'s', () => {
    expect(rulesOf(REST, ALWAYS)).toBe(REST.rules);
    expect(rulesOf(REST, TEND)).toBe(DOWNTIME.actions[0]!.rules);
    const rules: RecoveryRule[] = [{ target: STRESS, does: 'set', to: 0 }];
    const changed = withScopeRules(REST, TEND, rules);
    expect(changed.choices![0]!.actions[0]!.rules).toBe(rules);
    expect(changed.rules).toBe(REST.rules);
    expect(changed.choices![0]!.actions[1]).toBe(DOWNTIME.actions[1]);
    expect(scopeName(REST, TEND)).toBe('Tend to Wounds');
    expect(scopeName(REST, ALWAYS)).toBe('Short rest');
  });

  it('give way to Always where their action is gone', () => {
    const gone: RuleScope = { kind: 'action', choice: 'step-a', action: 'nope' };
    expect(resolveScope(REST, gone)).toBe(ALWAYS);
    expect(resolveScope(REST, TEND)).toBe(TEND);
    expect(rulesOf(REST, gone)).toEqual([]);
    expect(withScopeRules(REST, gone, [])).toBe(REST);
  });

  it('set and remove the rule an action has for a metric, apart from the button\'s', () => {
    const set = withRule(REST, { target: HP, does: 'share', share: 0.5, round: 'down' }, TEND)!;
    expect(ruleFor(set, HP, TEND)).toEqual({ target: HP, does: 'share', share: 0.5, round: 'down' });
    expect(ruleFor(set, HP)).toEqual({ target: HP, does: 'full' });
    const added = withRule(set, { target: STRESS, does: 'set', to: 0 }, TEND)!;
    expect(rulesOf(added, TEND)).toHaveLength(2);
    expect(rulesOf(withoutRule(added, HP, TEND), TEND)).toEqual([{ target: STRESS, does: 'set', to: 0 }]);
    expect(withoutRule(added, HP, TEND).rules).toEqual(REST.rules);
  });

  it('hold an action to the rules a button may hold', () => {
    const many = Array.from({ length: MAX_RECOVERY_RULES }, (_, index): RecoveryRule => ({ target: { kind: 'resource', key: `r${index}` }, does: 'full' }));
    const full = withScopeRules(REST, TEND, many);
    expect(withRule(full, { target: { kind: 'resource', field: 'one-more' }, does: 'full' }, TEND)).toBeNull();
  });

  it('let a removed button go from the rows of action rules too', () => {
    const rows = { kind: 'counters', field: 'features', rows: ['rest-long01', 'rest-short1'] } as const;
    const long: RecoveryButton = { id: 'rest-long01', name: 'Long rest', rules: [] };
    const short = withScopeRules(REST, TEND, [{ target: rows, does: 'full' }]);
    const [left] = withoutButton([short, long], 'rest-long01');
    expect(rulesOf(left!, TEND)[0]!.target).toEqual({ ...rows, rows: ['rest-short1'] });
  });
});

describe('steps', () => {
  it('are added asking for exactly one of a single action, up to the limit, as the parser reads them', () => {
    const plain: RecoveryButton = { id: 'rest-x', name: 'Rest', rules: [] };
    const added = withAddedChoice(plain, 'Choose one', 'Action', () => 0.25)!;
    const choice = added.button.choices![0]!;
    expect(choice).toMatchObject({ prompt: 'Choose one', min: 1, max: 1, actions: [{ name: 'Action', rules: [] }] });
    expect(added.scope).toEqual({ kind: 'action', choice: choice.id, action: choice.actions[0]!.id });
    expect(choice.id).toMatch(/^step-[0-9a-z]{6}$/);
    expect(reread(added.button)).toEqual(added.button);

    let button = plain;
    for (let index = 0; index < MAX_RECOVERY_CHOICES; index += 1) button = withAddedChoice(button, 'Pick', 'Action')!.button;
    expect(new Set(button.choices!.map((each) => each.id)).size).toBe(MAX_RECOVERY_CHOICES);
    expect(withAddedChoice(button, 'Pick', 'Action')).toBeNull();
  });

  it('are removed, the last taking `choices` with it', () => {
    expect(withoutChoice(REST, 'step-a')).toEqual({ id: 'rest-short1', name: 'Short rest', rules: REST.rules });
  });

  it('take exactly or up to a number of picks, within their actions unless one may be picked again', () => {
    expect(pickMode(DOWNTIME)).toBe('exactly');
    expect(withPicks(DOWNTIME, 'upTo', 2)).toMatchObject({ min: 0, max: 2 });
    expect(pickMode(withPicks(DOWNTIME, 'upTo', 2))).toBe('upTo');
    expect(withPicks(DOWNTIME, 'exactly', 3)).toMatchObject({ min: 3, max: 3 });
    // Three actions, no repeats: never more than three
    expect(withPicks(DOWNTIME, 'exactly', 6)).toMatchObject({ min: 3, max: 3 });
    expect(withPicks(DOWNTIME, 'exactly', 0)).toMatchObject({ min: 1, max: 1 });
    const repeating = withRepeat(DOWNTIME, true);
    expect(repeating.repeat).toBe(true);
    expect(mostPicks(repeating)).toBe(MAX_ACTION_PICKS);
    expect(withPicks(repeating, 'exactly', 5)).toMatchObject({ min: 5, max: 5 });
  });

  it('cap their picks at their actions once repeats are off', () => {
    const five = withPicks(withRepeat(DOWNTIME, true), 'exactly', 5);
    const off = withRepeat(five, false);
    expect(off).toMatchObject({ min: 3, max: 3 });
    expect('repeat' in off).toBe(false);
    expect(clampedPicks(DOWNTIME)).toBe(DOWNTIME);
  });

  it('keep a prompt that reads', () => {
    expect(withPrompt(DOWNTIME, '  ').prompt).toBe(DOWNTIME.prompt);
    expect(withPrompt(DOWNTIME, ' Choose one ').prompt).toBe('Choose one');
  });
});

describe('actions', () => {
  it('are added with ids of their own, up to the limit', () => {
    const added = withAddedAction(REST, 'step-a', 'Repair Armor')!;
    const actions = added.button.choices![0]!.actions;
    expect(actions.at(-1)).toMatchObject({ name: 'Repair Armor', rules: [] });
    expect(added.scope).toEqual({ kind: 'action', choice: 'step-a', action: actions.at(-1)!.id });
    let button = REST;
    while ((button.choices![0]!.actions.length) < MAX_RECOVERY_ACTIONS) button = withAddedAction(button, 'step-a', 'More')!.button;
    expect(new Set(button.choices![0]!.actions.map((action) => action.id)).size).toBe(MAX_RECOVERY_ACTIONS);
    expect(withAddedAction(button, 'step-a', 'One more')).toBeNull();
    expect(withAddedAction(REST, 'gone', 'x')).toBeNull();
  });

  it('are removed with the step\'s counts brought within the actions left, never the last', () => {
    const exactlyTwo = withoutAction(REST, 'step-a', 'act-project')!;
    expect(exactlyTwo.choices![0]).toMatchObject({ min: 2, max: 2 });
    const one = withoutAction(exactlyTwo, 'step-a', 'act-clear')!;
    expect(one.choices![0]).toMatchObject({ min: 1, max: 1 });
    expect(withoutAction(one, 'step-a', 'act-tend')).toBeNull();

    const upToThree = withChoiceChanged(REST, 'step-a', (choice) => withPicks(choice, 'upTo', 3));
    const upToTwo = withoutAction(upToThree, 'step-a', 'act-tend')!;
    expect(upToTwo.choices![0]).toMatchObject({ min: 0, max: 2 });
    expect(reread(upToTwo)).toEqual(upToTwo);
  });

  it('are named, described and opened to others, optional keys left out when unset', () => {
    const action = DOWNTIME.actions[1]!;
    expect(withActionName(action, ' ').name).toBe('Clear Stress');
    expect(withActionName(action, ' Shake it off ').name).toBe('Shake it off');
    const described = withActionText(action, ' Clear 1d4 Stress. ');
    expect(described.text).toBe('Clear 1d4 Stress.');
    expect('text' in withActionText(described, '  ')).toBe(false);
    expect(withForOthers(action, true).forOthers).toBe(true);
    expect('forOthers' in withForOthers(DOWNTIME.actions[0]!, false)).toBe(false);
    const changed = withActionChanged(REST, 'step-a', 'act-clear', (each) => withForOthers(withActionText(each, 'Clear Stress.'), true));
    expect(reread(changed)).toEqual(changed);
  });
});
