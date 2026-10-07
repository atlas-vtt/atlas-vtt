/**
 * What a scene record keeps in the asset index alone, never in its library record file, a bundle, a copy or a
 * fingerprint: the data extensions keep on it (`data.extensions`), the extension that added it (`data.createdBy`)
 * and the images Atlas wrote for that extension (`data.createdImages`).
 * `createdBy` and `createdImages` are permissions (`scenes.replaceMap` acts on them), so they are only ever taken
 * from this device's index, never from a file someone may have copied, edited or forged, and they hold only for the
 * map the index named: a file that moves the scene to another map drops them.
 */
import type { Asset, SceneAssetData } from './AssetService';

export const SCENE_INDEX_KEYS = ['extensions', 'createdBy', 'createdImages'] as const;

/** The index-only keys a scene keeps across a file read. */
export type SceneIndexData = Pick<SceneAssetData, 'extensions' | 'createdBy' | 'createdImages'>;

/** A scene's index-only data with the map path the index held beside it (`indexedMapPath`, never written to the record). */
export type KeptSceneIndexData = SceneIndexData & { readonly indexedMapPath?: string | undefined };

const KEPT_KEYS: readonly string[] = SCENE_INDEX_KEYS;
/** The keys that grant `scenes.replaceMap`: valid only for the map they were written for. */
const PERMISSION_KEYS: readonly string[] = ['createdBy', 'createdImages'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const hasIndexData = (data: Record<string, unknown>): boolean => SCENE_INDEX_KEYS.some((key) => key in data);

const withoutIndexKeys = <T extends object>(data: T): T =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !(SCENE_INDEX_KEYS as readonly string[]).includes(key))) as T;

/** `asset` without its index-only data; the same object when it has none. */
export function withoutSceneExtensions(asset: Asset): Asset {
  return asset.type === 'scene' && asset.data !== undefined && hasIndexData(asset.data as Record<string, unknown>)
    ? { ...asset, data: withoutIndexKeys(asset.data) }
    : asset;
}

/** The index-only data `asset` holds (a scene's), with its indexed map path; null when it holds none. */
export function sceneIndexDataOf(asset: Asset | undefined): KeptSceneIndexData | null {
  if (asset?.type !== 'scene' || !asset.data) return null;
  const own = Object.fromEntries(Object.entries(asset.data).filter(([key]) => KEPT_KEYS.includes(key))) as SceneIndexData;
  return Object.keys(own).length > 0 ? { ...own, indexedMapPath: asset.data.mapPath } : null;
}

/**
 * A scene record taken in from its library file, with the index-only data `kept` (what the index held for that id):
 * a file another device or a sync tool changed brings the scene's own content and never takes away, or hands out,
 * what extensions keep.
 */
export function withIndexOnlySceneData(fromFile: Asset, kept: KeptSceneIndexData | null): Asset {
  const plain = withoutSceneExtensions(fromFile);
  if (plain.type !== 'scene' || !kept) return plain;
  const { indexedMapPath, ...data } = kept;
  // A file that points the scene at another map gets no permission over it: they were granted for the indexed map.
  const granted = indexedMapPath === undefined || plain.data?.mapPath === indexedMapPath
    ? data
    : Object.fromEntries(Object.entries(data).filter(([key]) => !PERMISSION_KEYS.includes(key)));
  return { ...plain, data: { ...plain.data, ...granted } };
}

/** A parsed record file (a scene's JSON mirror, whose keys sit at the root, or a whole scene record) without its index-only data. */
export function withoutJsonExtensions(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed;
  if (typeof parsed.mapPath === 'string' && hasIndexData(parsed)) return withoutIndexKeys(parsed);
  if (parsed.type === 'scene' && isRecord(parsed.data) && hasIndexData(parsed.data)) return { ...parsed, data: withoutIndexKeys(parsed.data) };
  return parsed;
}

/**
 * `incoming` (an asset from a bundle, which never carries extension data) with the extension data of `local`, the
 * record it replaces: an update must not take away what extensions keep on the user's own scene.
 */
export function keepingExtensionData(incoming: Asset, local: Asset | undefined): Asset {
  if (incoming.type !== 'scene' || local?.type !== 'scene' || !local.data?.extensions) return incoming;
  return { ...incoming, data: { ...incoming.data, extensions: local.data.extensions } };
}
