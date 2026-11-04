import { describe, expect, it } from 'vitest';
import { fsQuantityLook } from '../../../src/app/resources/quantityLooks';
import { tokenQuantities } from '../../../src/app/resources/statblockQuantities';
import type { StatblockLayout } from '../../../src/app/react/components/statblock/statblockTypes';
import { ARMOR, HP, STRESS } from '../../mocks/resourceFixtures';

const daggerheart = fsQuantityLook({ id: 'daggerheart-adversary', name: 'Daggerheart Adversary', blocks: [] });
const basic = fsQuantityLook({ id: 'basic', name: 'Basic', blocks: [] });

describe('the quantities the DM screen lists for a token', () => {
  it('shows the collection\'s resources as boxes on a Daggerheart statblock, which draws them as tracks', () => {
    const token = { resources: { hp: { current: 4, max: 9 }, stress: { current: 0, max: 4 } } };
    expect(tokenQuantities({ hp: 8, stress: 3 }, daggerheart, token, [HP, STRESS])).toEqual([
      { key: 'hp', label: 'HP', value: { current: 4, max: 9 }, fills: false, boxes: true },
      { key: 'stress', label: 'Stress', value: { current: 0, max: 4 }, fills: true, boxes: true },
    ]);
  });

  it('draws those tracks as boxes also where the collection defines neither', () => {
    const token = { resources: { hp: { current: 6, max: 8 }, stress: { current: 1, max: 3 } } };
    expect(tokenQuantities({ hp: 8, stress: 3 }, daggerheart, token, []).map((q) => [q.key, q.boxes, q.fills]))
      .toEqual([['hp', true, false], ['stress', true, true]]);
    expect(tokenQuantities({ hp: 8, stress: 3, mana: 4 }, daggerheart, {}, [HP]).map((q) => [q.key, q.boxes]))
      .toEqual([['stress', true], ['mana', false]]);
  });

  it('shows them as gauges on every other statblock, however small', () => {
    const token = { resources: { hp: { current: 2, max: 4 }, stress: { current: 0, max: 3 } } };
    expect(tokenQuantities({ hp: 4, stress: 3 }, basic, token, [HP, STRESS]).map((q) => q.boxes)).toEqual([false, false]);
  });

  it('adds the further quantities a statblock names, with the token\'s own numbers first', () => {
    const quantities = tokenQuantities({
      Health: '12', ac: 18, atk: 3, tier: 1,
      mana: { value: 3, max: 7 }, battery: { current: 2, max: 5 },
      resources: { Momentum: { current: 0, max: 6 } },
    }, basic, { resources: { hp: { current: 12, max: 12 }, mana: { current: 0, max: 8 } } }, [HP]);
    expect(quantities).toMatchObject([
      { key: 'hp', value: { current: 12, max: 12 } },
      { key: 'mana', label: 'Mana', value: { current: 0, max: 8 }, boxes: false },
      { key: 'battery', value: { current: 2, max: 5 } },
      { key: 'resources.Momentum', label: 'Momentum', value: { current: 0, max: 6 } },
    ]);
  });

  it('lists Fate stress tracks one by one, as boxes that fill', () => {
    const layout: StatblockLayout = { id: 'basic', name: 'Basic', blocks: [
      { id: 'stress', type: 'table', properties: ['stress'], headers: ['Physical', 'Mental'] },
    ] };
    expect(tokenQuantities({ stress: [3, 2] }, fsQuantityLook(layout), {}, [HP])).toEqual([
      { key: 'stress.0', label: 'Physical stress', value: { current: 0, max: 3 }, fills: true, boxes: true },
      { key: 'stress.1', label: 'Mental stress', value: { current: 0, max: 2 }, fills: true, boxes: true },
    ]);
  });

  it('never makes a quantity of descriptive text, dice expressions or invalid values', () => {
    expect(tokenQuantities({ hp: '5d8+5', stress: 'Immune', mana: NaN, stamina: -1, health: Infinity }, basic, {}, [HP])).toEqual([]);
  });

  it('lists a quantity once when a resource of the collection reads its field', () => {
    const mana = { ...STRESS, key: 'mana', name: 'Mana', field: 'resources.Mana', direction: 'drains' as const };
    const token = { resources: { hp: { current: 5, max: 5 }, mana: { current: 2, max: 5 } } };
    expect(tokenQuantities({ hp: 5, resources: { Mana: 5 }, luck: 3 }, basic, token, [HP, mana]).map((q) => q.key)).toEqual(['hp', 'mana', 'luck']);
  });

  it('keeps the hit points, stress and hope a token holds though nothing defines them', () => {
    const token = { resources: { hp: { current: 0, max: 0 }, stress: { current: 2, max: 3 }, hope: { current: 1, max: 6 } } };
    expect(tokenQuantities({}, basic, token, [])).toMatchObject([
      { key: 'hp', label: 'HP', value: { current: 0, max: 0 }, fills: false },
      { key: 'stress', label: 'Stress', value: { current: 2, max: 3 }, fills: true },
      { key: 'hope', label: 'Hope', value: { current: 1, max: 6 }, fills: false },
    ]);
  });

  it('leaves out what a token still holds of a resource the collection no longer defines', () => {
    const token = { resources: { hp: { current: 5, max: 5 }, ammo: { current: 3, max: 6 } } };
    expect(tokenQuantities({ hp: 5 }, basic, token, [HP]).map((q) => q.key)).toEqual(['hp']);
  });

  it('leaves out a static value: there is nothing to spend', () => {
    const token = { resources: { hp: { current: 5, max: 5 }, armor: { current: 15, max: 15 } } };
    expect(tokenQuantities({ hp: 5, ac: 15 }, basic, token, [HP, ARMOR]).map((q) => q.key)).toEqual(['hp']);
  });
});
