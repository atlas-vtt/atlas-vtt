import { describe, expect, it } from 'vitest';
import { partyKey, readPartyKey, type PartyValues } from '../../src/app/campaigns/partyValues/partyKeys';
import { followWrite, settleTokens, withPartyValues, type PartyContext } from '../../src/app/campaigns/partyValues/partyReconcile';
import type { TokenEntity } from '../../src/app/types';

const CAMPAIGN = 'campaign-1';
const context: PartyContext = {
  campaignId: CAMPAIGN,
  characterOf: (token) => (token.assetId?.startsWith('pc-') ? token.assetId : null),
};
const key = (character: string, resource: string): string => partyKey(CAMPAIGN, character, resource);

function token(id: string, assetId: string, resources: TokenEntity['resources'], overriddenMax?: string[]): TokenEntity {
  return {
    id, kind: 'character', name: id, x: 0, y: 0, imagePath: `${assetId}.png`, assetId,
    ...(resources && { resources }),
    ...(overriddenMax && { overriddenMax }),
  } as TokenEntity;
}

describe('party keys', () => {
  it('reads back what they name, ids with any character included', () => {
    const named = partyKey('c"1', 'pc/ä', 'resources.Momentum');
    expect(readPartyKey(named)).toEqual({ campaignId: 'c"1', characterId: 'pc/ä', resourceKey: 'resources.Momentum' });
    expect(readPartyKey('hp')).toBeNull();
    expect(readPartyKey('[1,2,3]')).toBeNull();
  });
});

describe('a write the GM made', () => {
  it('gives an edited value to the party and to the character\'s other tokens', () => {
    const a = token('a', 'pc-1', { hp: { current: 20, max: 20 }, mana: { current: 5, max: 10 } });
    const b = token('b', 'pc-1', { hp: { current: 20, max: 22 } });
    const party: PartyValues = { [key('pc-1', 'hp')]: { current: 20, max: 20 }, [key('pc-1', 'mana')]: { current: 5, max: 10 } };
    const edited = { ...a, resources: { ...a.resources, hp: { current: 12, max: 20 } } };
    const write = followWrite({ tokens: { a, b }, partyValues: party }, { tokens: { a: edited, b }, partyValues: party }, context);
    expect(write.party).toEqual({ [key('pc-1', 'hp')]: { current: 12, max: 20 } });
    // The sibling keeps the maximum its own statblock gives it.
    expect(write.tokens.b?.resources?.hp).toEqual({ current: 12, max: 22 });
    expect(Object.keys(write.tokens)).toEqual(['b']);
  });

  it('carries a maximum set by hand, and its giving back, to the other tokens', () => {
    const a = token('a', 'pc-1', { hp: { current: 20, max: 20 } });
    const b = token('b', 'pc-1', { hp: { current: 20, max: 20 } });
    const party: PartyValues = { [key('pc-1', 'hp')]: { current: 20, max: 20 } };
    const raised = { ...a, resources: { hp: { current: 25, max: 30 } }, overriddenMax: ['hp'] };
    const first = followWrite({ tokens: { a, b }, partyValues: party }, { tokens: { a: raised, b }, partyValues: party }, context);
    expect(first.party[key('pc-1', 'hp')]).toEqual({ current: 25, max: 30, maxByHand: true });
    expect(first.tokens.b).toMatchObject({ resources: { hp: { current: 25, max: 30 } }, overriddenMax: ['hp'] });

    const settled = { a: raised, b: first.tokens.b! };
    const after = { ...settled.a, overriddenMax: [] };
    const second = followWrite({ tokens: settled, partyValues: { ...party, ...first.party } }, { tokens: { ...settled, a: after }, partyValues: { ...party, ...first.party } }, context);
    expect(second.party[key('pc-1', 'hp')]).toEqual({ current: 25, max: 30 });
    expect(second.tokens.b?.overriddenMax).toBeUndefined();
  });

  it('lets a new token of a character take the party\'s values and adopt what the party lacks', () => {
    const party: PartyValues = { [key('pc-1', 'hp')]: { current: 7, max: 20 } };
    const placed = token('c', 'pc-1', { hp: { current: 20, max: 20 }, luck: { current: 3, max: 3 } });
    const write = followWrite({ tokens: {}, partyValues: party }, { tokens: { c: placed }, partyValues: party }, context);
    expect(write.party).toEqual({ [key('pc-1', 'luck')]: { current: 3, max: 3 } });
    expect(write.tokens.c?.resources).toEqual({ hp: { current: 7, max: 20 }, luck: { current: 3, max: 3 } });
  });

  it('brings values that reached the party from elsewhere to every token of the character', () => {
    const a = token('a', 'pc-1', { hp: { current: 20, max: 20 } });
    const b = token('b', 'pc-1', {});
    const before: PartyValues = { [key('pc-1', 'hp')]: { current: 20, max: 20 } };
    const after: PartyValues = { [key('pc-1', 'hp')]: { current: 9, max: 20 }, [key('pc-1', 'mana')]: { current: 1, max: 4 } };
    const write = followWrite({ tokens: { a, b }, partyValues: before }, { tokens: { a, b }, partyValues: after }, context);
    expect(write.party).toEqual({});
    expect(write.tokens.a?.resources).toEqual({ hp: { current: 9, max: 20 }, mana: { current: 1, max: 4 } });
    expect(write.tokens.b?.resources).toEqual({ hp: { current: 9, max: 20 }, mana: { current: 1, max: 4 } });
  });

  it('leaves other tokens, other campaigns and moves alone', () => {
    const monster = token('m', 'goblin', { hp: { current: 7, max: 7 } });
    const a = token('a', 'pc-1', { hp: { current: 20, max: 20 } });
    const party: PartyValues = { [key('pc-1', 'hp')]: { current: 20, max: 20 }, [partyKey('other', 'pc-1', 'hp')]: { current: 1, max: 20 } };
    const hurt = { ...monster, resources: { hp: { current: 2, max: 7 } } };
    const moved = { ...a, x: 140 };
    const write = followWrite({ tokens: { m: monster, a }, partyValues: party }, { tokens: { m: hurt, a: moved }, partyValues: party }, context);
    expect(write).toEqual({ tokens: {}, party: {} });
  });
});

describe('settling a scene', () => {
  it('adopts the values the party lacks, the first token first, and gives the party\'s to every token', () => {
    const a = token('a', 'pc-1', { hp: { current: 11, max: 20 }, mana: { current: 2, max: 10 } });
    const b = token('b', 'pc-1', { hp: { current: 15, max: 20 }, mana: { current: 9, max: 10 } });
    const party: PartyValues = { [key('pc-1', 'hp')]: { current: 4, max: 20 } };
    const write = settleTokens({ tokens: { a, b }, partyValues: party }, context, true);
    expect(write.party).toEqual({ [key('pc-1', 'mana')]: { current: 2, max: 10 } });
    expect(write.tokens.a?.resources).toEqual({ hp: { current: 4, max: 20 }, mana: { current: 2, max: 10 } });
    expect(write.tokens.b?.resources).toEqual({ hp: { current: 4, max: 20 }, mana: { current: 2, max: 10 } });
  });

  it('adopts nothing after an undo, and rebuilds the tokens from the party', () => {
    const a = token('a', 'pc-1', { hp: { current: 11, max: 20 }, mana: { current: 2, max: 10 } });
    const party: PartyValues = { [key('pc-1', 'hp')]: { current: 4, max: 20 } };
    const write = settleTokens({ tokens: { a }, partyValues: party }, context, false);
    expect(write.party).toEqual({});
    expect(write.tokens.a?.resources).toEqual({ hp: { current: 4, max: 20 }, mana: { current: 2, max: 10 } });
  });

  it('writes nothing where the tokens already hold the party\'s values', () => {
    const a = token('a', 'pc-1', { hp: { current: 4, max: 20 } });
    expect(settleTokens({ tokens: { a }, partyValues: { [key('pc-1', 'hp')]: { current: 4, max: 20 } } }, context, true)).toEqual({ tokens: {}, party: {} });
  });
});

describe('a token taking values', () => {
  it('keeps its own maximum unless the party\'s was set by hand, and clamps the current value', () => {
    const own = token('a', 'pc-1', { hp: { current: 5, max: 10 } });
    expect(withPartyValues(own, [['hp', { current: 14, max: 20 }]]).resources?.hp).toEqual({ current: 10, max: 10 });
    expect(withPartyValues(own, [['hp', { current: 14, max: 20, maxByHand: true }]])).toMatchObject({ resources: { hp: { current: 14, max: 20 } }, overriddenMax: ['hp'] });
    expect(withPartyValues(own, [['hp', { current: 5, max: 99 }]])).toBe(own);
  });
});
