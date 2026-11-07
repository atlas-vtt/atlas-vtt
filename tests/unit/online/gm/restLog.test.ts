import { describe, expect, it } from 'vitest';
import { MAX_REST_CHANGES, MAX_REST_ROLL, MAX_REST_TEXT, parseLogEntry } from '../../../../src/app/online/protocol/index.ts';
import { restChangeOwners, restRecordOf } from '../../../../src/app/online/gm/log/restEntry.ts';
import { restPicksText, restRulesText } from '../../../../src/app/online/gm/book/restRules.ts';
import type { RecoveryButton } from '../../../../src/app/recovery/recoveryTypes';
import type { RestSummary } from '../../../../src/app/recovery/restEvents';
import type { RestChange, RestPlan } from '../../../../src/app/recovery/restTypes';

const change = (label: string, rolls: RestChange['rolls'] = []): RestChange => ({ character: { id: 'pc', name: 'Mira' }, target: { kind: 'resource', key: 'hp' }, label, from: 4, to: 13, rolls });

describe('a rest in the table\'s log', () => {
  it('cuts every text to what the protocol carries, as shown, so the entry reads back exactly', () => {
    const long = 'Very  long\tname '.repeat(20);
    const rolls = Array.from({ length: 30 }, () => ({ formula: '1d8+(2)', total: 7 }));
    const summary: RestSummary = {
      characterId: 'pc', characterName: long, notePath: 'n.md', button: { id: 'long', name: long }, picks: [],
      changes: [change(long, rolls), ...Array.from({ length: 20 }, (_, index) => change(`Row ${index}`))],
      skipped: [{ index: 0, rule: { target: { kind: 'condition', id: 'x' }, does: 'clear' }, label: '  ', reason: { kind: 'no-token', id: 'x' } }],
      text: '',
    };
    const record = restRecordOf(summary);
    expect([...record.character]).toHaveLength(MAX_REST_TEXT);
    expect(record.character.endsWith('…')).toBe(true);
    expect(record.changes).toHaveLength(MAX_REST_CHANGES);
    expect([...(record.changes[0]?.roll ?? '')].length).toBeLessThanOrEqual(MAX_REST_ROLL);
    expect(record.changes[0]?.roll?.startsWith('1d8+2 = 7, 1d8+2 = 7')).toBe(true);
    // A skipped rule whose name shows nothing is left out.
    expect(record.skipped).toBeUndefined();
    const entry = { id: 'e'.repeat(24), at: 1, who: 'gm', name: 'GM', kind: 'rest', ...record };
    expect(parseLogEntry(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
  });
});

describe('a rest with actions picked in it, in the log', () => {
  it('names the actions picked, and the character a change was made to where that is not the one resting', () => {
    const kestrel = { id: 'pc-kestrel', name: 'Kestrel' };
    const summary: RestSummary = {
      characterId: 'pc', characterName: 'Mira', notePath: 'n.md', button: { id: 'short', name: 'Short rest' }, picks: ['Tend to Wounds', 'Clear Stress'],
      changes: [{ ...change('Stress'), from: 3, to: 2 }, { ...change('Hit Points', [{ formula: '1d4+(1)', total: 4 }]), character: kestrel, from: 2, to: 6 }],
      skipped: [], text: '',
    };
    expect(restRecordOf(summary)).toEqual({
      character: 'Mira', button: 'Short rest', picks: ['Tend to Wounds', 'Clear Stress'],
      changes: [{ label: 'Stress', from: 3, to: 2 }, { label: 'Hit Points', from: 2, to: 6, roll: '1d4+1 = 4', character: 'Kestrel' }],
    });
    expect(restChangeOwners(summary)).toEqual(['pc', 'pc-kestrel']);
    // A change whose label shows nothing is left out of both alike.
    expect(restChangeOwners({ ...summary, changes: [change(' '), ...summary.changes] })).toEqual(['pc', 'pc-kestrel']);
  });
});

describe('what a rest request will do, as its card says it', () => {
  it('names each action picked, one taken for another character with whom', () => {
    const button: RecoveryButton = {
      id: 'short', name: 'Short rest', rules: [],
      choices: [{ id: 'moves', prompt: 'Choose two', min: 2, max: 2, actions: [{ id: 'tend', name: 'Tend to Wounds', rules: [], forOthers: true }, { id: 'stress', name: 'Clear Stress', rules: [] }] }],
    };
    const picks = [{ choice: 'moves', action: 'tend', for: 'pc-kestrel' }, { choice: 'moves', action: 'stress', for: null }, { choice: 'moves', action: 'gone', for: null }];
    expect(restPicksText(button, picks, (id) => (id === 'pc-kestrel' ? 'Kestrel' : id))).toEqual(['Tend to Wounds for Kestrel', 'Clear Stress']);
  });

  it('names the character a rule changes where that is not the one resting', () => {
    const hp = { kind: 'resource' as const, key: 'hp', label: 'HP', definition: { key: 'hp', name: 'HP', field: 'hp', direction: 'drains' as const, color: '#c33' }, value: { current: 4, max: 20 } };
    const plan = {
      button: { id: 'short', name: 'Short rest', rules: [] },
      rules: [
        { index: 0, ref: 'always:0', rule: { target: { kind: 'resource', field: 'hp' }, does: 'full' }, target: hp, character: { id: 'pc', name: 'Mira' } },
        { index: 1, ref: 'pick:0:0', rule: { target: { kind: 'resource', field: 'hp' }, does: 'amount', formula: '1d4' }, target: hp, character: { id: 'pc-kestrel', name: 'Kestrel' } },
      ],
      skipped: [],
    } as unknown as RestPlan;
    expect(restRulesText(plan, { picks: [], spends: new Map() }, 'pc')).toEqual(['HP to full', 'Kestrel: HP +1d4']);
  });

  it('names each rule that changes something, a spend by its count', () => {
    const hp = { kind: 'resource' as const, key: 'hp', label: 'HP', definition: { key: 'hp', name: 'HP', field: 'hp', direction: 'drains' as const, color: '#c33' }, value: { current: 4, max: 20 } };
    const exhaustion = { kind: 'condition' as const, id: 'ex', label: 'Exhaustion', definition: { id: 'ex', name: 'Exhaustion', valued: true }, value: 2 };
    const source = (key: string, name: string, current: number) => ({ kind: 'resource' as const, key, label: name, definition: { key, name, field: key, direction: 'drains' as const, color: '#333' }, value: { current, max: 5 } });
    const plan = {
      button: { id: 'long', name: 'Long rest', rules: [] },
      rules: [
        { index: 0, ref: 'always:0', rule: { target: { kind: 'resource', field: 'hp' }, does: 'full' }, target: hp },
        { index: 1, ref: 'always:1', rule: { target: { kind: 'resource', field: 'hp' }, does: 'spend', from: { kind: 'resource', field: 'hd' }, each: '1d8' }, target: hp, source: source('hd', 'Hit Dice', 3), spend: { label: 'Hit Dice', max: 3, each: '1d8' } },
        { index: 2, ref: 'always:2', rule: { target: { kind: 'resource', field: 'hp' }, does: 'spend', from: { kind: 'resource', field: 'sp' }, each: '1' }, target: hp, source: source('sp', 'Spirit', 3), spend: { label: 'Spirit', max: 3, each: '1' } },
        { index: 3, ref: 'always:3', rule: { target: { kind: 'condition', id: 'ex' }, does: 'step', by: -1 }, target: exhaustion },
      ],
      skipped: [],
    } as unknown as RestPlan;
    expect(restRulesText(plan, { picks: [], spends: new Map([['always:1', 2], ['always:2', 0]]) })).toEqual(['HP to full', '2 Hit Dice', 'Exhaustion −1']);
    // Two spends of one source share what it holds: the second names what is left of it
    const shared = { ...plan, rules: [plan.rules[1]!, { ...plan.rules[1]!, index: 4, ref: 'pick:0:0' }] } as RestPlan;
    expect(restRulesText(shared, { picks: [], spends: new Map([['always:1', 2], ['pick:0:0', 3]]) })).toEqual(['2 Hit Dice', '1 Hit Dice']);
  });
});
