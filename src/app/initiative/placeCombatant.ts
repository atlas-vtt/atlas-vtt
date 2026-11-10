import type { AtlasView } from '../atlas-view';
import { spawnTargetOf, viewCentrePlace } from '../packages/components/asset-manager/utils/spawnTarget';
import { isOffMap, sceneTokens } from '../tokens/offMap';

/**
 * Puts a combatant kept beside the map on it: the GM places it by hand where the map can
 * (`TokenPlacer`), otherwise it lands in the middle of what the GM sees (on the grid where tokens
 * snap). It lies on top of every other token and is selected: one undo step, after which it is a
 * token like any other. Nothing while the scene is loading or the token is no longer beside the map.
 */
export function placeCombatantOnMap(view: AtlasView, tokenId: string): void {
  const store = view.getStore();
  const token = sceneTokens(store.getState().objects)[tokenId];
  if (!token || !isOffMap(token)) return;
  const target = spawnTargetOf(view);
  if (!target) return;
  const put = (x: number, y: number): string[] => {
    if (!isOffMap(sceneTokens(store.getState().objects)[tokenId])) return [];
    store.getState().placeOffMapToken(tokenId, x, y);
    return [tokenId];
  };
  const centre = viewCentrePlace(target, token.size || 1);
  if (!target.placer) {
    put(centre.x, centre.y);
    return;
  }
  void target.placer.place({ tokens: [{ ...token, ...centre }], commit: ([placed]) => (placed ? put(placed.x, placed.y) : []) });
}
