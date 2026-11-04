import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { rewriteCollectionSnapshots } from '../snapshots/sceneSnapshotFolders';
import { runUntracked } from '../stores/history';
import { AssetService } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { updateCollectionScenes } from './collectionScenes';
import { removeCondition, type TokenConditionState } from '../utils/conditionValues';

type TokensWithConditions = Record<string, TokenConditionState>;

/**
 * Tokens store their conditions by id. When a collection stops defining a
 * condition (a preset was switched or deleted, a condition removed), these
 * helpers take it off every token of the collection's scenes, their snapshots
 * and the maps open right now, so no invisible condition is left behind.
 */

function tokenConditionIds(token: TokenConditionState): string[] {
  return [...(token.conditions ?? []), ...Object.keys(token.conditionValues ?? {})];
}

/** Condition ids that tokens carry, as a condition or a stored value, but `defined` does not contain. */
export function unknownConditionIds(tokens: TokensWithConditions, defined: ReadonlySet<string>): Set<string> {
  const unknown = new Set<string>();
  for (const token of Object.values(tokens)) {
    for (const id of tokenConditionIds(token)) if (!defined.has(id)) unknown.add(id);
  }
  return unknown;
}

/** Removes undefined conditions and their values from the tokens in place; returns whether any token changed. */
export function dropUnknownConditions(tokens: TokensWithConditions, defined: ReadonlySet<string>): boolean {
  let changed = false;
  for (const token of Object.values(tokens)) {
    for (const id of new Set(tokenConditionIds(token))) {
      if (defined.has(id)) continue;
      removeCondition(token, id);
      changed = true;
    }
  }
  return changed;
}

/** The map or snapshot JSON without undefined conditions, or null when nothing changes. */
export function dropUnknownConditionsFromJson(content: string, defined: ReadonlySet<string>): string | null {
  const data: unknown = JSON.parse(content);
  const tokens = isPersistedMapEnvelope(data) ? data.state?.objects?.tokens : undefined;
  return tokens && dropUnknownConditions(tokens, defined) ? JSON.stringify(data, null, 2) : null;
}

function pruneOpenView(view: AtlasView, defined: ReadonlySet<string>): void {
  const store = view.getStore();
  const tokens = store.getState().objects.tokens;
  const unknown = unknownConditionIds(tokens, defined);
  if (unknown.size === 0) return;
  // Not an undo step: undoing it would bring back conditions the collection no longer has.
  runUntracked(store, () => {
    const tokenIds = Object.keys(tokens);
    for (const id of unknown) store.getState().setTokensCondition(tokenIds, id, false);
  });
}

/**
 * Takes every condition the collection does not define (any more) off the
 * tokens of its scenes: in open maps, in map files and in scene snapshots.
 */
export async function removeUndefinedConditions(app: App, collectionId: string): Promise<void> {
  const defined = new Set(AssetService.getInstance(app).getCollectionSettings(collectionId).conditions.map((condition) => condition.id));
  const rewrite = (content: string): string | null => dropUnknownConditionsFromJson(content, defined);
  await updateCollectionScenes(app, collectionId, { updateOpen: (view) => pruneOpenView(view, defined), rewrite });
  await rewriteCollectionSnapshots(app, collectionId, rewrite);
}
