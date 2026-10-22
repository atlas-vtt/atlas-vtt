import { describe, expect, it, vi } from 'vitest';
import type { CharacterRest } from '../../../src/app/recovery/characterRest';
import type { CharacterChanges, RestOutcome } from '../../../src/app/recovery/restTypes';
import { writeRest, type CounterWrite } from '../../../src/app/recovery/restWrites';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { Character } from '../../../src/app/types';
import type { TokenAsset } from '../../../src/app/services/AssetService';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { FIELDS, character as restCharacter, row } from './restFixtures';

const party = vi.hoisted(() => ({ value: vi.fn(() => ({ current: 4, max: 6, maxByHand: true })), setValue: vi.fn(() => true) }));
vi.mock('../../../src/app/campaigns/partyValues/PartySync', () => ({ PartySync: { forApp: () => party } }));

const placed = (id: string, extra: Partial<Character> = {}): Character => ({ id, kind: 'character', name: 'Mira', imagePath: 'mira.png', x: 0, y: 0, ...extra });
const ASSET = { id: 'mira', name: 'Mira', imagePath: 'mira.png', collection: 'c' } as TokenAsset;
const USES = FIELDS[0]!;

function setUp() {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `rest-${Math.random()}`);
  const tokens = {
    a: placed('a', { resources: { hp: { current: 4, max: 20 } }, conditions: ['exhaustion'], conditionValues: { exhaustion: 2 } }),
    b: placed('b', { conditions: ['exhaustion'], conditionValues: { exhaustion: 2 } }),
  };
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens } });
  const record = { uses: [row('Wand', 3, 3)] };
  const rest: CharacterRest = {
    asset: ASSET,
    notePath: 'Mira.md',
    templateId: 'pc-abc123',
    template: { format: 'atlas-statblock-template', version: 1, id: 'pc-abc123', fields: FIELDS, layout: { blocks: [] } } as unknown as CharacterRest['template'],
    record,
    buttons: [],
    character: restCharacter(),
    holds: [{ store, tokenIds: ['a', 'b'] }],
    resourcePlace: (key) => (key === 'hp' || key === 'hitDice' ? { kind: 'token', store, tokenId: 'a' } : key === 'stress' ? { kind: 'party', campaignId: 'camp' } : null),
  };
  return { app, store, rest, record };
}

/** A rest that changed Mira's values by `parts`. */
function outcome(parts: Partial<CharacterChanges>): RestOutcome {
  return { changes: [], skipped: [], byCharacter: new Map([['mira', { resources: new Map(), counters: new Map(), conditions: new Map(), ...parts }]]) };
}

describe('writeRest', () => {
  it('writes resources and conditions on the map as one undo step', async () => {
    const { app, store, rest } = setUp();
    const before = getHistoryStore(store)?.getState().pastStates.length ?? 0;
    await writeRest(app, rest, outcome({ resources: new Map([['hp', { current: 20, max: 20 }]]), conditions: new Map([['exhaustion', 1]]) }), async () => null);
    const { a, b } = store.getState().objects.tokens;
    expect(a?.resources?.hp).toEqual({ current: 20, max: 20 });
    // Every token of the character takes it, another form's too
    expect(b?.resources?.hp).toEqual({ current: 20, max: 20 });
    expect(a?.conditionValues).toEqual({ exhaustion: 1 });
    expect(b?.conditionValues).toEqual({ exhaustion: 1 });
    expect(getHistoryStore(store)?.getState().pastStates.length ?? 0).toBe(before + 1);
  });

  it('writes every resource it changed of one token, not only the last', async () => {
    const { app, store, rest } = setUp();
    await writeRest(app, rest, outcome({ resources: new Map([['hp', { current: 20, max: 20 }], ['hitDice', { current: 3, max: 4 }]]) }), async () => null);
    expect(store.getState().objects.tokens.a?.resources).toEqual({ hp: { current: 20, max: 20 }, hitDice: { current: 3, max: 4 } });
  });

  it('takes a condition at 0 off every token', async () => {
    const { app, store, rest } = setUp();
    await writeRest(app, rest, outcome({ conditions: new Map([['exhaustion', 0]]) }), async () => null);
    expect(store.getState().objects.tokens.a).not.toHaveProperty('conditions');
    expect(store.getState().objects.tokens.b).not.toHaveProperty('conditionValues');
  });

  it('writes a resource no token holds into the played campaign\'s values', async () => {
    const { app, rest } = setUp();
    await writeRest(app, rest, outcome({ resources: new Map([['stress', { current: 0, max: 6 }]]) }), async () => null);
    expect(party.setValue).toHaveBeenCalledWith('camp', 'mira', 'stress', { current: 0, max: 6, maxByHand: true });
  });

  it('writes counters as one patch per field, based on what the rest read', async () => {
    const { app, rest, record } = setUp();
    const next = [row('Wand', 3, 0)];
    let written: readonly CounterWrite[] = [];
    const problem = await writeRest(app, rest, outcome({ counters: new Map([['uses', { field: USES, base: record.uses, next }]]) }), async (writes) => {
      written = writes;
      return null;
    });
    expect(problem).toBeNull();
    expect(written.map((write) => write.patches)).toEqual([[{ op: 'set', path: ['uses'], base: record.uses, next }]]);
  });

  it('answers why the note could not take its counters', async () => {
    const { app, rest, record } = setUp();
    const problem = await writeRest(app, rest, outcome({ counters: new Map([['uses', { field: USES, base: record.uses, next: [] }]]) }), async () => 'the note changed meanwhile.');
    expect(problem).toBe('the note changed meanwhile.');
  });
});
