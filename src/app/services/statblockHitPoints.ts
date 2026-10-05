import { mapResources } from '../resources/collectionResources';
import { isHitPointsKey } from '../resources/resourceFields';
import { resourceUpdate } from '../resources/resourceValues';
import type { App } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlas-view';
import type { ViewAtlasStore } from '../storeFactory';
import type { TokenUpdates } from '../types/viewState';
import { rollStatblockDice } from './statblockDiceLinks';
import { AssetService } from './AssetService';
import type { TokenVitals } from './statblockVitalsSync';

type PlacedToken = TokenVitals & { id: string };

/** The game master's map view that holds every one of these tokens. */
function storeHoldingTokens(app: App, ids: readonly string[], viewId?: string): ViewAtlasStore | null {
  for (const leaf of app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)) {
    const view = leaf.view as unknown as { viewId?: string; getStore?: () => ViewAtlasStore };
    if (viewId && view.viewId !== viewId) continue;
    const store = view.getStore?.();
    const state = store?.getState();
    if (store && state && !state.isPlayerView && ids.every((id) => state.objects.tokens[id])) return store;
  }
  return null;
}

/**
 * Rolls a statblock's hit dice once per token and puts each token at full
 * health with its own result. A rolled maximum is a deliberate choice, so it is
 * marked as overridden and survives later edits to the statblock. Without
 * placed tokens, or in a collection that tracks no hit points, this is an
 * ordinary roll.
 */
export function rollHitPoints(
  app: App,
  formula: string,
  statblockPath: string,
  tokens: readonly TokenVitals[],
  abilityName?: string,
  viewId?: string,
): void {
  const placed = tokens.filter((token): token is PlacedToken => Boolean(token.id));
  const store = placed.length ? storeHoldingTokens(app, placed.map((token) => token.id), viewId) : null;
  // The resource the collection fills from the statblock's hit points, whatever it is called.
  const key = store && mapResources(AssetService.getInstance(app), store.getState().mapPath)
    .find((definition) => isHitPointsKey(definition.field))?.key;
  if (!store || !key) {
    rollStatblockDice(app, formula, { statblockPath, abilityName, viewId });
    return;
  }

  const entries: Array<{ id: string; changes: TokenUpdates }> = [];
  for (const token of placed) {
    const roll = rollStatblockDice(app, formula, {
      viewId,
      tokenId: token.id,
      statblockPath,
      tokenName: token.name,
      tokenImagePath: token.imagePath,
      abilityName,
    });
    if (!roll) continue;
    const hp = Math.max(1, roll.total);
    const held = store.getState().objects.tokens[token.id] ?? {};
    entries.push({ id: token.id, changes: resourceUpdate(held, key, { current: hp, max: hp }, true) });
  }
  if (entries.length) store.getState().updateTokens(entries);
}
