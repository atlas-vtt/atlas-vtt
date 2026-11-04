import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { findSense } from '../gameSystems/senseRules';
import { readCollectionSenses } from '../gameSystems/senseValidation';
import { rewriteCollectionSnapshots } from '../snapshots/sceneSnapshotFolders';
import { runUntracked } from '../stores/history';
import type { TokenVision, TokenVisionDefaults } from '../types/lightingTypes';
import type { SenseDefinition } from '../types/senseTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { AssetService } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { updateCollectionScenes } from './collectionScenes';

/**
 * Tokens store their senses by id. When a collection stops defining a sense (one of its own was
 * deleted, its game system switched), these helpers take it off every token of the collection's
 * scenes, their snapshots, the maps open right now and what new tokens start with, so no sense
 * that resolves to nothing is left behind.
 */

type TokensWithVision = Record<string, { vision?: TokenVision | undefined }>;

/**
 * `vision` without the senses `definitions` does not know (`findSense`: the collection's and
 * the generic ones), or `vision` itself when it names none. A list that loses its last sense is
 * removed, so the token follows its statblock again; a list that was empty stays.
 */
function withoutUnknownSenses<T extends TokenVisionDefaults>(vision: T, definitions: readonly SenseDefinition[]): T {
  if (!Array.isArray(vision.senses)) return vision;
  const known = vision.senses.filter((sense) => findSense(definitions, sense.id));
  if (known.length === vision.senses.length) return vision;
  const { senses: _senses, ...rest } = vision;
  return (known.length > 0 ? { ...rest, senses: known } : rest) as T;
}

/** Removes undefined senses from the tokens in place; returns whether any token changed. */
export function dropUnknownSenses(tokens: TokensWithVision, definitions: readonly SenseDefinition[]): boolean {
  let changed = false;
  for (const token of Object.values(tokens)) {
    if (!token.vision) continue;
    const vision = withoutUnknownSenses(token.vision, definitions);
    if (vision === token.vision) continue;
    token.vision = vision;
    changed = true;
  }
  return changed;
}

/** The map or snapshot JSON without undefined senses, or null when nothing changes. */
export function dropUnknownSensesFromJson(content: string, definitions: readonly SenseDefinition[]): string | null {
  const data: unknown = JSON.parse(content);
  const tokens = isPersistedMapEnvelope(data) ? data.state?.objects?.tokens : undefined;
  return tokens && dropUnknownSenses(tokens, definitions) ? JSON.stringify(data, null, 2) : null;
}

function pruneOpenView(view: AtlasView, definitions: readonly SenseDefinition[]): void {
  const store = view.getStore();
  const changes = Object.values(store.getState().objects.tokens).flatMap((token) => {
    const vision = token.vision && withoutUnknownSenses(token.vision, definitions);
    return vision && vision !== token.vision ? [{ id: token.id, changes: { vision } }] : [];
  });
  if (changes.length === 0) return;
  // Not an undo step: undoing it would bring back senses the collection no longer has.
  runUntracked(store, () => store.getState().updateTokens(changes));
}

/**
 * Takes every sense the collection does not define (any more) off the tokens of its scenes (in
 * open maps, in map files and in scene snapshots) and out of what its new tokens start with.
 */
export async function removeUndefinedSenses(app: App, collectionId: string, presets: readonly SystemPreset[]): Promise<void> {
  const assets = AssetService.getInstance(app);
  const settings = assets.getCollectionSettings(collectionId);
  const definitions = readCollectionSenses(settings, presets);

  const defaults = settings.defaultTokenVision && withoutUnknownSenses(settings.defaultTokenVision, definitions);
  if (defaults !== settings.defaultTokenVision) await assets.updateCollectionSettings(collectionId, { defaultTokenVision: defaults });

  const rewrite = (content: string): string | null => dropUnknownSensesFromJson(content, definitions);
  await updateCollectionScenes(app, collectionId, { updateOpen: (view) => pruneOpenView(view, definitions), rewrite });
  await rewriteCollectionSnapshots(app, collectionId, rewrite);
}
