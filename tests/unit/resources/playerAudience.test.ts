import { afterEach, describe, expect, it } from 'vitest';
import { setPlayerTokenSource } from '../../../src/app/characters/playerTokens';
import { PLAYER_AUDIENCES, playerAudience, withPlayerAudience } from '../../../src/app/resources/playerAudience';
import { keepingPlayerVisibility, parseResourceDefinition, sameResourceDefinitions } from '../../../src/app/resources/resourceDefinitions';
import { visibleResources } from '../../../src/app/resources/visibleResources';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';

const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', visibleToPlayers: false };
const hp = { hp: { current: 3, max: 8 } };
const hero = { id: 'hero', vision: { enabled: true }, resources: hp };
const goblin = { id: 'goblin', resources: hp };
const shopkeeper = { id: 'shop', side: 'friends', resources: hp };
const pc = { id: 'pc', assetId: 'library-pc', resources: hp };

const seenOn = (definition: ResourceDefinition, token: Parameters<typeof visibleResources>[0]): boolean =>
  visibleResources(token, [definition], 'player').length > 0;

afterEach(() => setPlayerTokenSource(null));

describe('player audience', () => {
  it('reads every audience back as it was set', () => {
    for (const audience of PLAYER_AUDIENCES) expect(playerAudience(withPlayerAudience(HP, audience))).toBe(audience);
  });

  it('stores a narrowed audience hidden for an Atlas that knows only visibleToPlayers', () => {
    expect(withPlayerAudience(HP, 'party')).toMatchObject({ visibleToPlayers: false, visibleOnSide: 'players' });
    expect(withPlayerAudience(HP, 'opponents')).toMatchObject({ visibleToPlayers: false, visibleOnSide: 'opponents' });
    expect(withPlayerAudience(withPlayerAudience(HP, 'party'), 'everyone')).toEqual({ ...HP, visibleToPlayers: true });
  });

  it('shows a party resource on the party\'s tokens only, and an opponents\' one on every other token', () => {
    setPlayerTokenSource({ isPlayers: (token) => token.assetId === 'library-pc', subscribe: () => () => {} });
    const party = withPlayerAudience(HP, 'party');
    const foes = withPlayerAudience(HP, 'opponents');
    expect([hero, pc, goblin, shopkeeper].map((token) => seenOn(party, token))).toEqual([true, true, false, false]);
    expect([hero, pc, goblin, shopkeeper].map((token) => seenOn(foes, token))).toEqual([false, false, true, true]);
    expect(seenOn(party, { ...goblin, side: 'players' })).toBe(true);
  });

  it('never narrows what the GM or the token\'s own player sees', () => {
    const party = withPlayerAudience(HP, 'party');
    expect(visibleResources(goblin, [party], 'dm')).toHaveLength(1);
    expect(visibleResources(goblin, [party], 'owner')).toHaveLength(1);
  });

  it('survives reading, and refuses a side it does not know', () => {
    expect(parseResourceDefinition(withPlayerAudience(HP, 'opponents'))).toMatchObject({ visibleOnSide: 'opponents' });
    expect(parseResourceDefinition({ ...HP, visibleOnSide: 'allies' })).not.toHaveProperty('visibleOnSide');
  });

  it('is the table\'s choice: no edit of the rules, and kept when the rules change', () => {
    expect(sameResourceDefinitions([HP], [withPlayerAudience(HP, 'party')])).toBe(true);
    const kept = keepingPlayerVisibility([{ ...HP, color: '#dc2626', visibleToPlayers: true }], [withPlayerAudience(HP, 'party')]);
    expect(playerAudience(kept[0]!)).toBe('party');
  });
});
