import type { Asset, AssetMetadata, BaseAsset, MapAsset, SceneAsset } from '../AssetService';
import { collectionFolderPath, collectionIdOfPath } from '../assetPaths';
import { parseGroupTokenRefs } from '../assetMetadataGuards';
import { isRecord } from '../../utils/guards';
import { prettifyIdentifier } from '../collectionRecords';
import { recoveredId, stemOf } from './recoveredIds';
import { isReservedCollectionPath } from './reservedPaths';

const MAP_JSON = /^atlas-vtt\/collections\/([^/]+)\/maps\/(.+)\.json$/;
const TYPED_JSON = /^atlas-vtt\/collections\/([^/]+)\/(scenes|encounters|players|characters|statblocks)\/(.+)\.json$/;

/** Whether `path` can hold the JSON of an asset that Atlas takes into its index. */
export const isAdoptableJson = (path: string): boolean => !isReservedCollectionPath(path) && (MAP_JSON.test(path) || TYPED_JSON.test(path));

const stringOr = (value: unknown, fallback: string): string => (typeof value === 'string' && value.trim() ? value : fallback);
const tagsOf = (value: unknown): string[] => (Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []);

/** Shared fields of a record rebuilt from its JSON payload. */
function baseOf(payload: Record<string, unknown>, id: string, collection: string, name: string, now: number): BaseAsset {
  const createdAt = typeof payload.createdAt === 'number' ? payload.createdAt : now;
  return {
    id,
    name,
    tags: tagsOf(payload.tags),
    collection,
    createdAt,
    modifiedAt: typeof payload.modifiedAt === 'number' ? payload.modifiedAt : createdAt,
  };
}

/** `mapPath` inside the collection `collectionId` when it names the same place in another collection's folder. */
function withinCollection(mapPath: string, collectionId: string): string {
  const other = collectionIdOfPath(mapPath);
  if (!other || other === collectionId) return mapPath;
  return collectionFolderPath(collectionId) + mapPath.slice(collectionFolderPath(other).length);
}

/** Adds records for unindexed files of the vault; `owned` holds the paths records own and grows with each one. */
class Adoption {
  changed = false;

  constructor(
    private readonly metadata: AssetMetadata,
    private readonly files: ReadonlySet<string>,
    private readonly owned: Set<string>,
    private readonly now: number,
  ) {}

  private isFree(path: string): boolean {
    return this.files.has(path) && !this.owned.has(path);
  }

  private add(asset: Asset, ...paths: string[]): void {
    this.metadata.assets[asset.id] = asset;
    for (const path of paths) this.owned.add(path);
    this.changed = true;
  }

  /** A map record from its JSON below `maps/`. The index already knowing the id means the file is a stray copy. */
  adoptMapJson(path: string, collection: string, payload: Record<string, unknown>): void {
    const id = stringOr(payload.id, stemOf(path));
    const mapFilePath = typeof payload.mapFilePath === 'string' ? payload.mapFilePath : '';
    if (this.metadata.assets[id] || !this.files.has(mapFilePath)) return;
    const map: MapAsset = {
      ...baseOf(payload, id, collection, stringOr(payload.name, stemOf(mapFilePath)), this.now),
      type: 'map',
      filePath: path,
      mapFilePath,
    };
    this.add(map, path);
  }

  /**
   * A scene record from its JSON, for a map no other scene has. A JSON copied
   * from another collection's folder finds the map copied along with it.
   */
  adoptSceneJson(path: string, collection: string, payload: Record<string, unknown>): void {
    const stated = typeof payload.mapPath === 'string' ? payload.mapPath : '';
    const candidates = [stated && withinCollection(stated, collection), stated, path.replace(/\.json$/, '.atlasmap')];
    const mapPath = candidates.find((candidate) => candidate && this.isFree(candidate));
    if (!mapPath) return;
    const ownId = stemOf(path);
    const id = this.metadata.assets[ownId] ? recoveredId('scene', path) : ownId;
    const scene: SceneAsset = {
      ...baseOf(payload, id, collection, stringOr(payload.name, stemOf(mapPath)), this.now),
      type: 'scene',
      filePath: path,
      data: { ...payload, mapPath },
    };
    this.add(scene, path, mapPath);
  }

  /** An encounter, player group, character or statblock from its JSON payload. */
  adoptTypedJson(path: string, collection: string, folder: string, payload: Record<string, unknown>): void {
    const ownId = stemOf(path);
    const type = folder === 'encounters' ? 'encounter' : folder === 'players' ? 'player' : folder === 'characters' ? 'character' : 'statblock';
    const id = this.metadata.assets[ownId] ? recoveredId(type, path) : ownId;
    const base: BaseAsset = { ...baseOf(payload, id, collection, stringOr(payload.name, prettifyIdentifier(ownId)), this.now), filePath: path };
    if (type === 'encounter' || type === 'player') {
      const tokens = parseGroupTokenRefs(payload.tokens);
      this.add({ ...base, type, tokens, data: { ...payload, tokens } }, path);
    } else {
      this.add({ ...base, type, data: payload }, path);
    }
  }

  /** A scene for a map file in a collection folder that no scene has. */
  adoptSceneMap(path: string): void {
    const collection = collectionIdOfPath(path);
    const id = recoveredId('scene', path);
    if (!collection || this.metadata.assets[id]) return;
    const scene: SceneAsset = {
      id,
      type: 'scene',
      name: stemOf(path),
      tags: [],
      collection,
      createdAt: this.now,
      modifiedAt: this.now,
      data: { mapPath: path },
    };
    this.add(scene, path);
  }
}

/**
 * Takes asset files the index does not know into it: JSON files first, since
 * they keep ids, names and tags, then scene maps without a scene. `json` holds
 * the parsed content of the unindexed JSON files. Returns whether any was added.
 */
export function adoptUnindexedFiles(
  metadata: AssetMetadata,
  files: ReadonlySet<string>,
  json: ReadonlyMap<string, unknown>,
  owned: Set<string>,
  now: number,
): boolean {
  const adoption = new Adoption(metadata, files, owned, now);
  for (const path of [...json.keys()].sort()) {
    const payload = json.get(path);
    if (owned.has(path) || !files.has(path) || !isRecord(payload) || !isAdoptableJson(path)) continue;
    const mapMatch = MAP_JSON.exec(path);
    if (mapMatch) {
      adoption.adoptMapJson(path, mapMatch[1]!, payload);
      continue;
    }
    const typedMatch = TYPED_JSON.exec(path);
    if (!typedMatch) continue;
    if (typedMatch[2] === 'scenes') adoption.adoptSceneJson(path, typedMatch[1]!, payload);
    else adoption.adoptTypedJson(path, typedMatch[1]!, typedMatch[2]!, payload);
  }

  for (const path of [...files].sort()) {
    if (path.endsWith('.atlasmap') && !owned.has(path) && !isReservedCollectionPath(path)) adoption.adoptSceneMap(path);
  }
  return adoption.changed;
}
