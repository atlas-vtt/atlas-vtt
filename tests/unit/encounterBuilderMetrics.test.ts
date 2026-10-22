import { describe, expect, it } from 'vitest';
import type { IndexedCreature } from '../../src/app/creatures/CreatureIndex';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import type { ResourceDefinition } from '../../src/app/resources/resourceTypes';
import { encounterDrafts, withCount } from '../../src/app/packages/components/asset-manager/encounter-builder/encounterPicks';
import { encounterMetrics } from '../../src/app/packages/components/asset-manager/encounter-builder/encounterMetrics';

function token(id: string): TokenAsset {
  return { id, name: id, tags: [], folderId: null, modifiedAt: 0, type: 'tokens', imageUrl: '', imagePath: `${id}.png`, statblockPath: `${id}.md` };
}

function creature(id: string, fields: Record<string, unknown>): IndexedCreature {
  return { path: `${id}.md`, fields, templateId: null, meanings: {}, lookName: null };
}

const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#ff0000', defeatedWhenSpent: true, visibleToPlayers: true };
const STRESS: ResourceDefinition = { key: 'stress', name: 'Stress', field: 'stress', direction: 'fills', color: '#0000ff', visibleToPlayers: true };

const goblin = token('goblin');
const ogre = token('ogre');

describe('encounter picks', () => {
  it('adds, counts, clamps and removes creatures in the order they were picked', () => {
    let picks = withCount([], goblin, 1);
    picks = withCount(picks, ogre, 2);
    picks = withCount(picks, goblin, 500);
    expect(picks.map((pick) => [pick.token.id, pick.count])).toEqual([['goblin', 99], ['ogre', 2]]);
    expect(withCount(picks, goblin, 0).map((pick) => pick.token.id)).toEqual(['ogre']);
  });

  it('saves one token reference per copy', () => {
    const drafts = encounterDrafts(withCount([], goblin, 3));
    expect(drafts).toHaveLength(3);
    expect(drafts[0]).toEqual({ id: 'goblin', name: 'goblin', imagePath: 'goblin.png', size: 1, statblockPath: 'goblin.md' });
  });
});

describe('encounter metrics', () => {
  const creatures = new Map([
    ['goblin.md', creature('goblin', { cr: '1/4', hp: '7 (2d6)', stress: 3 })],
    ['ogre.md', creature('ogre', { cr: 2, hp: 59 })],
    ['knight.md', creature('knight', { level: 5 })],
  ]);
  const lookup = (path: string): IndexedCreature | undefined => creatures.get(path);
  const picks = withCount(withCount([], goblin, 3), ogre, 1);

  it('spans ratings on their one scale and sums what defeats a creature', () => {
    const metrics = encounterMetrics(picks, lookup, [HP, STRESS]);
    expect(metrics.count).toBe(4);
    expect(metrics.rating).toMatchObject({ min: 0.25, max: 2 });
    // Stress fills and defeats no one, so it is not summed.
    expect(metrics.totals).toEqual([{ key: 'hp', name: 'HP', value: 3 * 7 + 59 }]);
  });

  it('says nothing it cannot say of every creature', () => {
    const metrics = encounterMetrics(withCount(picks, token('knight'), 1), lookup, [HP]);
    expect(metrics.rating).toBeNull();
    expect(metrics.totals).toEqual([]);
  });
});
