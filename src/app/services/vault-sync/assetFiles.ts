import type { Asset, AssetMetadata, AssetOfType, AssetUpdates, GroupAsset, GroupTokenRef } from '../AssetService';
import { collectionFolderPath } from '../assetPaths';
import { SOUNDS_FOLDER } from '../../soundLibrary/soundFiles';
import { isExternalAudioPath } from '../../soundLibrary/soundPaths';

type RecordFolderAsset = AssetOfType<'token' | 'note' | 'sound'>;

type JsonBackedType = Exclude<Asset['type'], RecordFolderAsset['type']>;

/** Whether an asset's record lies in a folder of its kind, its primary file being art, a note or audio, rather than in JSON of its own. */
export const hasRecordFolder = (asset: Asset): asset is RecordFolderAsset =>
  asset.type === 'token' || asset.type === 'note' || asset.type === 'sound';

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
 * The JSON file Atlas keeps for an asset in its collection folder; tokens, notes
 * and sounds have none. Records without a place of their own find it by their id.
 */
export function assetJsonPath(asset: Asset): string | null {
  if (hasRecordFolder(asset)) return null;
  return asset.filePath || defaultJsonPath(asset.type, asset.collection, asset.id);
}

/** The folder below a collection that holds the record files of the assets that have no JSON of their own. */
const RECORD_FOLDERS = { token: 'tokens', note: 'notes', sound: SOUNDS_FOLDER } as const;

/**
 * The vault file that holds an asset's whole record: the JSON of maps, scenes,
 * encounters and the other JSON-backed types, and `tokens/<id>.json`,
 * `notes/<id>.json` or `sounds/<id>.json` for tokens, notes and sounds, whose
 * primary file is art, a note or audio.
 */
export function recordFilePath(asset: Asset): string {
  if (hasRecordFolder(asset)) {
    return `${collectionFolderPath(asset.collection)}/${RECORD_FOLDERS[asset.type]}/${asset.id}.json`;
  }
  return assetJsonPath(asset) ?? '';
}

/** The vault file that backs an asset: the token image, the note, a sound's record, or the asset's JSON file. */
export function assetFilePath(asset: Asset): string {
  if (asset.type === 'token') return asset.imagePath;
  if (asset.type === 'note') return asset.notePath;
  if (asset.type === 'sound') return recordFilePath(asset);
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
    // Audio in a root outside the vault is no vault file: no vault file of the same name is ever taken for it.
    case 'sound': return isExternalAudioPath(asset.audioPath) ? null : asset.audioPath || null;
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
    case 'sound': return { audioPath: path };
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
  const record = hasRecordFolder(asset) ? recordFilePath(asset) : null;
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
