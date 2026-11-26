import type { RulesLookup } from '../../src/app/gameSystems/mapRules';

/** Where a map outside every collection looks up its rules while no campaign is played: it has none, and its tokens track hit points. */
export const NO_RULES: RulesLookup = {
  getCollectionForMap: () => null,
  getCollectionSettings: (collectionId) => { throw new Error(`no collection ${collectionId}`); },
  playedSystem: () => null,
};
