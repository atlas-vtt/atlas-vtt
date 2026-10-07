import type { SceneAsset } from '../../src/app/services/AssetService';

/** A scene record with fixed bookkeeping, so two fixtures differ only by what a test sets. */
export function sceneAsset(partial: Partial<SceneAsset> = {}): SceneAsset {
  return { id: 's1', type: 'scene', name: 'Inn', tags: [], collection: 'c', createdAt: 1, modifiedAt: 1, ...partial };
}
