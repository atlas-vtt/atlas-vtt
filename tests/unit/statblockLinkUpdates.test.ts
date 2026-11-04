import { expect, it } from 'vitest';
import { buildStatblockLinkUpdates } from '../../src/app/pixi/token-renderer/statblockFrontmatter';
import { HP, STRESS } from '../mocks/resourceFixtures';

it('starts the resources the statblock supplies and keeps what the token held of the others', () => {
  const held = { hp: { current: 3, max: 12 }, stress: { current: 2, max: 6 }, mana: { current: 1, max: 8 } };
  expect(buildStatblockLinkUpdates({ fields: { name: 'Mage', hp: 27 } }, 'Hero', [HP, STRESS], held).resources).toEqual({
    hp: { current: 27, max: 27 }, stress: { current: 2, max: 6 }, mana: { current: 1, max: 8 },
  });
  // A statblock without hit points leaves hand-set ones alone
  expect(buildStatblockLinkUpdates({ fields: { name: 'Ghost' } }, 'Hero', [HP], { hp: { current: 3, max: 12 } }).resources).toEqual({ hp: { current: 3, max: 12 } });
  expect(buildStatblockLinkUpdates({ fields: { name: 'Goblin', hp: 7 } }, 'Hero', [HP], undefined).resources).toEqual({ hp: { current: 7, max: 7 } });
});

it('reads the hit points and the rating under the keys the statblock\'s template means', () => {
  const ironGuard = { fields: { name: 'Iron Guard', stamina: 30, level: 3 }, meanings: { 'hit-points': 'stamina', rating: 'level' } };
  expect(buildStatblockLinkUpdates(ironGuard, 'Hero', [HP], undefined)).toEqual({
    name: 'Iron Guard', difficulty: 'Level 3', resources: { hp: { current: 30, max: 30 } },
  });
});

it('keeps the token\'s name where the statblock names none, and labels its rating as placing does', () => {
  expect(buildStatblockLinkUpdates({ fields: { cr: '1/4' } }, 'Hero', [], undefined)).toEqual({ name: 'Hero', difficulty: 'CR 1/4', resources: {} });
});
