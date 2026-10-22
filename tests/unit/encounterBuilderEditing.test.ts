import { describe, expect, it, vi } from 'vitest';
import { updateEncounter, type EncounterTokenDraft } from '../../src/app/encounters/encounterSaveService';
import type { AssetService, EncounterAsset } from '../../src/app/services/AssetService';
import type { TokenAsset } from '../../src/app/packages/components/asset-manager/types';
import { encounterDrafts, picksFromEncounter, withCount } from '../../src/app/packages/components/asset-manager/encounter-builder/encounterPicks';

vi.mock('../../src/app/encounters/encounterThumbnail', () => ({ generateEncounterThumbnail: vi.fn(async () => null) }));

function token(id: string): TokenAsset {
  return { id, name: id, tags: [], folderId: null, modifiedAt: 0, type: 'tokens', imageUrl: '', imagePath: `${id}.png`, statblockPath: `${id}.md` };
}
const ref = (id: string, extra: Partial<EncounterTokenDraft> = {}): EncounterTokenDraft => ({ id, name: id, imagePath: `${id}.png`, size: 1, ...extra });

const goblin = token('goblin');
// Two goblins saved from a map with their places and state, and a token the collection does not list.
const saved = [
  ref('goblin', { cell: { q: 0, r: 0 }, state: { name: 'Goblin 1' } as unknown as NonNullable<EncounterTokenDraft['state']> }),
  ref('goblin', { cell: { q: 1, r: 0 } }),
  ref('statue'),
];

describe('editing a saved encounter', () => {
  it('reads its creatures back by token, keeping one it cannot find', () => {
    const picks = picksFromEncounter(saved, new Map([['goblin', goblin]]), (r) => ({ ...token(r.id), name: `ref ${r.id}` }));
    expect(picks.map((pick) => [pick.token.name, pick.count])).toEqual([['goblin', 2], ['ref statue', 1]]);
  });

  it('keeps the references it had as far as their creature keeps copies, and adds plain ones', () => {
    const picks = picksFromEncounter(saved, new Map([['goblin', goblin]]), (r) => token(r.id));
    const fewer = encounterDrafts(withCount(picks, goblin, 1), saved);
    expect(fewer.filter((draft) => draft.id === 'goblin')).toEqual([saved[0]]);
    const more = encounterDrafts(withCount(picks, goblin, 3), saved);
    expect(more.filter((draft) => draft.id === 'goblin')).toEqual([saved[0], saved[1], { id: 'goblin', name: 'goblin', imagePath: 'goblin.png', size: 1, statblockPath: 'goblin.md' }]);
    expect(more.at(-1)).toEqual(saved[2]);
  });

  it('saves the new name and tokens in place, keeping the rest of the encounter', async () => {
    const current: EncounterAsset = {
      id: 'e1', name: 'Old', type: 'encounter', collection: 'c', tags: ['cave'], createdAt: 1, modifiedAt: 1,
      tokens: saved, formation: { gridType: 'square', pitch: 70 }, difficulty: 'hard', thumbnailUrl: 'old.png',
      data: { tokens: saved, difficulty: 'hard', formation: { gridType: 'square', pitch: 70 }, description: 'x' },
    };
    const updateAsset = vi.fn(async () => undefined);
    const assetService = { getAssetById: vi.fn(async () => current), updateAsset } as unknown as AssetService;
    const tokens = [ref('goblin')];
    expect(await updateEncounter({} as never, assetService, 'e1', tokens, 'Goblin ambush')).toBe(true);
    expect(updateAsset).toHaveBeenCalledWith('e1', {
      name: 'Goblin ambush',
      tokens,
      thumbnailUrl: 'old.png',
      data: { tokens, difficulty: 'hard', formation: { gridType: 'square', pitch: 70 }, description: 'Encounter with 1 token' },
    });
  });
});
