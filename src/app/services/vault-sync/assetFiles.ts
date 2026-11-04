import type { Asset, AssetMetadata, AssetUpdates, GroupAsset, GroupTokenRef } from '../AssetService';
import { collectionFolderPath } from '../assetPaths';

type JsonBackedType = Exclude<Asset['type'], 'token' | 'note'>;

/** The folder inside a collection that holds the JSON files of each type. */
export const JSON_FOLDERS: Record<JsonBackedType, string> = {
  map: 'maps',
  scene: 'scenes',
  encounter: 'encounters',
  player: 'players',
  character: 'characters',
  statblock: 'statblocks',
};

/** Where Atlas puts the JSON file of a new asset of `type` in a collection. */
export function defaultJsonPath(type: JsonBackedType, collectionId: string, id: string): string {
  return `${collectionFolderPath(collectionId)}/${JSON_FOLDERS[type]}/${id}.json`;
}

/**
 * The JSON file Atlas keeps for an asset in its collection folder; tokens and
 * notes have none. Records without a place of their own find it by their id.
 */
export function assetJsonPath(asset: Asset): string | null {
  if (asset.type === 'token' || asset.type === 'note') return null;
  return asset.filePath || defaultJsonPath(asset.type, asset.collection, asset.id);
}

/** The folder below a collection that holds the record files of tokens and notes, which have no JSON of their own. */
const RECORD_FOLDERS = { token: 'tokens', note: 'notes' } as const;

/**
 * The vault file that holds an asset's whole record: the JSON of maps, scenes,
 * encounters and the other JSON-backed types, and `tokens/<id>.json` or
 * `notes/<id>.json` for tokens and notes, whose primary file is art or a note.
 */
export function recordFilePath(asset: Asset): string {
  if (asset.type === 'token' || asset.type === 'note') {
    return `${collectionFolderPath(asset.collection)}/${RECORD_FOLDERS[asset.type]}/${asset.id}.json`;
  }
  return assetJsonPath(asset) ?? '';
}

/** The vault file that backs an asset: the token image, the note, or the asset's JSON file. */
export function assetFilePath(asset: Asset): string {
  if (asset.type === 'token') return asset.imagePath;
  if (asset.type === 'note') return asset.notePath;
  return assetJsonPath(asset) ?? '';
}

/**
 * The file an asset stands for, which the user sees and moves: token art, a
 * map's image, a scene's `.atlasmap`, a note, or the JSON of the other types.
 * The JSON of maps and scenes only mirrors the index.
 */
export function primaryPath(asset: Asset): string | null {
  switch (asset.type) {
    case 'token': return asset.imagePath || null;
    case 'map': return asset.mapFilePath || null;
    case 'scene': return asset.data?.mapPath || null;
    case 'note': return asset.notePath || null;
    default: return assetJsonPath(asset);
  }
}

/** The update that points an asset at its primary file's new place. */
export function primaryPathUpdate(asset: Asset, path: string): AssetUpdates {
  switch (asset.type) {
    case 'token': return { imagePath: path };
    case 'map': return { mapFilePath: path };
    case 'scene': return { data: { ...asset.data, mapPath: path } };
    case 'note': return { notePath: path };
    default: return { filePath: path };
  }
}

/** Points the asset at its primary file's new place. */
export function setPrimaryPath(asset: Asset, path: string): void {
  Object.assign(asset, primaryPathUpdate(asset, path));
}

/** The JSON of maps and scenes, which follows the asset instead of deciding about it. */
export function sidecarPath(asset: Asset): string | null {
  return asset.type === 'map' || asset.type === 'scene' ? assetJsonPath(asset) : null;
}

/** Every vault path an asset record owns. */
export function ownedPaths(asset: Asset): string[] {
  const record = asset.type === 'token' || asset.type === 'note' ? recordFilePath(asset) : null;
  return [primaryPath(asset), sidecarPath(asset), record].filter((path): path is string => Boolean(path));
}

/** The paths owned by any asset in the index. */
export function indexedPaths(metadata: AssetMetadata): Set<string> {
  return new Set(Object.values(metadata.assets).flatMap(ownedPaths));
}

/** Token lists of a group asset: the top-level one and the copy inside its JSON payload. */
export function groupTokenRefs(asset: GroupAsset): GroupTokenRef[] {
  if (Array.isArray(asset.tokens)) return asset.tokens;
  return Array.isArray(asset.data?.tokens) ? asset.data.tokens : [];
}
