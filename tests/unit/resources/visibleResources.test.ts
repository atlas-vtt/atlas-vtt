import { describe, expect, it } from 'vitest';
import { shapeOf, visibleResources } from '../../../src/app/resources/visibleResources';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';

const def = (key: string, visibleToPlayers: boolean): ResourceDefinition => ({ key, name: key.toUpperCase(), field: key, direction: 'drains', color: '#ffffff', visibleToPlayers });

describe('visibleResources', () => {
  const definitions = [def('hp', true), def('str', false), def('ammo', true)];
  const token = { resources: { str: { current: 12, max: 14 }, hp: { current: 3, max: 8 }, mana: { current: 1, max: 1 } } };

  it('lists defined resources with a value in definition order', () => {
    expect(visibleResources(token, definitions, 'dm').map((r) => r.definition.key)).toEqual(['hp', 'str']);
  });

  it('shows players only what they may see', () => {
    expect(visibleResources(token, definitions, 'player').map((r) => r.definition.key)).toEqual(['hp']);
  });

  it('shows the player whose character the token is every value it holds', () => {
    expect(visibleResources(token, definitions, 'owner').map((r) => r.definition.key)).toEqual(['hp', 'str']);
  });

  it('hides values without a usable maximum', () => {
    expect(visibleResources({ resources: { hp: { current: 0, max: 0 } } }, definitions, 'dm')).toEqual([]);
  });

  it('shows a static value of 0, which is a value and no empty maximum', () => {
    const ac: ResourceDefinition = { ...def('ac', true), direction: 'static' };
    expect(visibleResources({ resources: { ac: { current: 0, max: 0 } } }, [ac], 'dm').map((r) => r.value)).toEqual([{ current: 0, max: 0 }]);
  });

  it('gives each resource the slot of its place in the collection, whatever the token holds', () => {
    const seven = ['hp', 'str', 'ammo', 'luck', 'mana', 'grit', 'fuel'].map((key) => def(key, true));
    const holder = { resources: { ammo: { current: 4, max: 6 }, grit: { current: 1, max: 1 }, fuel: { current: 2, max: 2 }, hp: { current: 3, max: 8 } } };
    // `str` has no value, so `ammo` keeps slot 2; a seventh definition is never shown
    expect(visibleResources(holder, seven, 'dm').map((r) => [r.definition.key, r.slot])).toEqual([['hp', 0], ['ammo', 2], ['grit', 5]]);
  });

  it('draws the first two slots as bars and the other four as wheels', () => {
    expect([0, 1, 2, 3, 4, 5].map(shapeOf)).toEqual(['bar', 'bar', 'wheel', 'wheel', 'wheel', 'wheel']);
  });
});
