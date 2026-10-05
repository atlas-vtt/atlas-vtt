import { parseResourceDefinitions } from '../resources/resourceDefinitions';
import { wasTokenRegistrationSaved } from './assetRegistrationRecovery';
import { SettingsService } from './SettingsService';
import { App, Notice, TFile, TFolder } from 'obsidian';
import { ensureAdapterFolder } from '../plugin/vaultFolders';
import type { TokenStateSnapshot } from '../types';
import type { CellCoord, EncounterFormation } from '../encounters/encounterFormation';
import { getDataFilePath } from '../utils/dataFileMigration';
import { SerialLock } from '../utils/serialLock';
import { runInBackground } from '../utils/backgroundTask';
import { preserveUnreadableMetadata, readStoredMetadata, type StoredMetadata } from './assetMetadataFile';
import { collectionNameKey, uniqueCollectionName } from './collectionNaming';
import { collectionFolderName, collectionFolderPath, collectionIdOfFolder, collectionNameProblem, COLLECTIONS_DIR, GLOBAL_ASSETS_DIR, ATLAS_VTT_DIR } from './assetPaths';
import { planFolderNameFixes } from './collectionFolderNames';
import { migrateInstallRecords } from './collectionBundle/installRecord';
import { createCollectionRecord, derivedCollectionRecord, defaultCollectionIdOf, forgetCollection, INITIAL_COLLECTION_ID, moveCollectionRecord, numberedCollectionName, prettifyIdentifier } from './collectionRecords';
import { assetFilePath, groupTokenRefs } from './vault-sync/assetFiles';
import { reconcileIndex, type VaultReconciliation } from './vault-sync/reconcileIndex';
import { listVault, readVault } from './vault-sync/vaultListing';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import { isLegacyTokenRecord, type LegacyAssetMetadata } from './assetMetadataGuards';
import { isRecord } from '../utils/guards';
import { groupLegacyTags, hasAssetTag, tagGroupOf, tagKey, type TagGroup } from './tagGroups';
import { t } from '../i18n';
import { trashVaultItem } from '../utils/trashVaultItem';
import { LibrarySync } from './library/LibrarySync';
import type { LibraryMergeResult } from './library/mergeLibraryChanges';
import { LEGACY_INDEX_FILE, LIBRARY_FILE, recordFilePath } from './library/libraryPaths';
import { isPayloadUnread, serializeRecord } from './library/recordFile';
import { libraryClock, parseLibraryState } from './library/libraryState';
import { trashSceneSnapshots } from '../snapshots/sceneSnapshotFolders';

export interface BaseAsset {
  id: string;
  name: string;
  tags: string[];
  collection: string;
  /** Vault path for JSON-backed assets when stored in subfolders */
  filePath?: string;
  createdAt: number;
  modifiedAt: number;
}

export interface TokenAsset extends BaseAsset {
  /** False preserves the whole artwork without an Atlas frame. Defaults to true. */
  showRing?: boolean;
  type: 'token';
  imagePath: string;
  /** Default footprint of spawned tokens as the size multiplier from `tokenSizing.ts`; missing means 1×1. */
  size?: number;
  /** Small preview written by AssetThumbnailService; regenerated when missing. */
  thumbnailPath?: string;
  statblockPath?: string; // Optional link to statblock note
}

export interface MapAsset extends BaseAsset {
  type: 'map';
  mapFilePath: string;
  thumbnailPath?: string;
}

export interface NoteAsset extends BaseAsset {
  type: 'note';
  notePath: string;
}

/** Token reference stored inside encounter and player group assets. */
export interface GroupTokenRef {
  id: string;
  name: string;
  imagePath: string;
  x?: number;
  y?: number;
  statblockPath?: string;
  size?: number;
}

export interface EncounterTokenRef extends GroupTokenRef {
  /** Cell offset from the encounter's anchor token (see EncounterFormation). */
  cell?: CellCoord;
  /** Pitch-normalised world offset from the anchor token. */
  offset?: { x: number; y: number };
  /** Full token state at save time (HP, conditions, statblock link, ...). Restored verbatim on spawn. */
  state?: TokenStateSnapshot;
}

export type EncounterDifficulty = 'easy' | 'medium' | 'hard' | 'deadly';

// An asset's `data` is the payload written to its own JSON file. It is optional
// everywhere because metadata written by older versions may lack it.

export interface SceneAssetData {
  /** Vault path of the scene's .atlasmap file. */
  mapPath?: string;
}

export interface EncounterAssetData {
  tokens?: EncounterTokenRef[];
  difficulty?: EncounterDifficulty;
  formation?: EncounterFormation;
  description?: string;
}

export interface PlayerAssetData {
  tokens?: GroupTokenRef[];
  level?: number;
  class?: string;
}

export interface StatblockAsset extends BaseAsset {
  type: 'statblock';
  /** Opaque statblock JSON; Atlas never reads it. */
  data?: Record<string, unknown>;
}

export interface CharacterAsset extends BaseAsset {
  type: 'character';
  /** Opaque character JSON; Atlas never reads it. */
  data?: Record<string, unknown>;
}

export interface SceneAsset extends BaseAsset {
  type: 'scene';
  mapId?: string;
  data?: SceneAssetData;
}

export interface EncounterAsset extends BaseAsset {
  type: 'encounter';
  tokens: EncounterTokenRef[];
  /** Grid the token layout was captured on. Absent for encounters saved without positions. */
  formation?: EncounterFormation;
  difficulty?: EncounterDifficulty;
  thumbnailUrl?: string; // Generated thumbnail for the encounter
  data?: EncounterAssetData;
}

export interface PlayerAsset extends BaseAsset {
  type: 'player';
  tokens: GroupTokenRef[];
  level?: number;
  class?: string;
  thumbnailUrl?: string; // Generated thumbnail for the player group
  data?: PlayerAssetData;
}

export type Asset = TokenAsset | MapAsset | NoteAsset | StatblockAsset | CharacterAsset | SceneAsset | EncounterAsset | PlayerAsset;

export type AssetOfType<T extends Asset['type']> = Extract<Asset, { type: T }>;

type NewAssetOf<A> = A extends Asset ? Omit<A, 'id' | 'createdAt' | 'modifiedAt'> : never;
/** An asset before the service assigns its id and timestamps. */
export type NewAsset = NewAssetOf<Asset>;

type AssetUpdatesOf<A> = A extends Asset
  ? { [K in Exclude<keyof A, 'id' | 'createdAt' | 'type' | 'collection'>]?: A[K] | undefined }
  : never;
/** Fields to change on an asset; an explicit `undefined` removes the field. Moving to another collection is `transferAssets`. */
export type AssetUpdates = AssetUpdatesOf<Asset>;

export type GroupAsset = EncounterAsset | PlayerAsset;

export { groupTokenRefs };
export { ATLAS_VTT_DIR, COLLECTIONS_DIR, GLOBAL_ASSETS_DIR };
export type { VaultReconciliation };

export interface TagMetadata {
  id: string;
  name: string;
  /** Missing on tags saved before tag groups existed; `migrateTags` fills it in. */
  group?: TagGroup;
  color?: string;
  icon?: string;
}

export interface CollectionMetadata {
  id: string;
  /** Globally unique identifier — survives export/import */
  uid: string;
  /** Release number. Only the publisher raises it, when exporting a release. */
  version: number;
  /** Vault that created the collection and publishes its releases; missing on collections from before publishing existed. */
  publisherId?: string;
  /** Author shown to people who install the collection. */
  author?: string;
  /** When the installed or last exported release was made. */
  releasedAt?: number;
  /** Vault path of the cover image shown when the collection is exported or imported. */
  coverPath?: string;
  name: string;
  description?: string;
  tags: Record<string, TagMetadata>; // Collection-specific tags
  /** Per-collection settings (game system, conditions, grid defaults, etc.) */
  settings: CollectionSettings;
  createdAt: number;
  modifiedAt: number;
}

export interface AssetMetadata {
  collections: Record<string, CollectionMetadata>;
  assets: Record<string, Asset>;
  version: number;
  /** Identifies this vault as the publisher of the collections it creates. */
  vaultId?: string;
  /** The collection new content goes to when none is chosen; read it through `defaultCollectionIdOf`. */
  defaultCollectionId?: string;
  /** The starter tokens were added once; deleted ones stay deleted on every device. */
  starterTokensAdded?: boolean;
}

/** What an import writes into the asset index, in one save. */
export interface CollectionImportCommit {
  collectionId: string;
  collection: CollectionMetadata;
  /** Asset records to add or replace, already pointing at their files in this vault. */
  upsert: readonly Asset[];
  /** Ids of asset records to drop; their files are handled by the import. */
  remove: readonly string[];
}

/** What moving or copying assets into a collection writes into the asset index, in one save. */
export interface AssetTransferCommit {
  collectionId: string;
  /** Asset records to add or replace, already pointing at their files in the target collection. */
  records: readonly Asset[];
  /** Tags the records carry that the target collection registers too. */
  tags: ReadonlyArray<TagMetadata & { group: TagGroup }>;
}

/**
 * This device's cache of the library, which lives in vault files (record files,
 * `collection.json`, `library.json`; see `library/`). Hidden on purpose: every
 * device builds its own from the files, so sync tools must not carry it.
 */
const ASSETS_METADATA_PATH = getDataFilePath(`${ATLAS_VTT_DIR}/assets-metadata.json`);
const LEGACY_ASSETS_METADATA_PATH = LEGACY_INDEX_FILE;
/** A sync tool may be rewriting the index; a few more reads ride that out. */
const METADATA_READ_OPTIONS = { retries: 3, retryDelayMs: 200 };
/** The key under which the cache keeps the library's device-local bookkeeping. */
const LIBRARY_STATE_KEY = 'libraryState';

/** Tags are keyed by their lower-case, hyphenated name. */
const tagIdOf = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, '-');

export class AssetService {
  private static instance: AssetService | null = null;
  private app: App;
  private metadata: AssetMetadata | null = null;
  private initialization: Promise<void> | null = null;
  /** Held by work that must not interleave with re-reading or checking the index, such as an import. */
  private readonly indexLock = new SerialLock();
  /** Metadata writes, in the order they were requested. */
  private readonly writes = new SerialLock();
  private saveCount = 0;
  /** Collections whose folder is being renamed to their name, so no check starts it twice. */
  private readonly folderRenames = new Set<string>();
  private readonly reconciledListeners = new Set<(result: VaultReconciliation) => void>();
  private readonly library: LibrarySync;
  /** Above zero while Atlas changes the index by itself (loading, a vault check); saves then reach only the cache. */
  private automaticDepth = 0;
  /** A vault check waiting for files that look like copies to stand long enough. */
  private copyCheck: number | null = null;

  private constructor(app: App) {
    this.app = app;
    this.library = new LibrarySync(app);
  }

  static getInstance(app?: App): AssetService {
    if (!AssetService.instance) {
      if (!app) {
        throw new Error('AssetService must be initialized with an App instance');
      }
      AssetService.instance = new AssetService(app);
    }
    return AssetService.instance;
  }

  /** Creates the storage folders and loads the index once; later calls await the first run. */
  initialize(): Promise<void> {
    this.initialization ??= this.initializeStorage().catch((error: unknown) => {
      this.initialization = null;
      throw error;
    });
    return this.initialization;
  }

  private async initializeStorage(): Promise<void> {
    await this.ensureDirectory(ATLAS_VTT_DIR);
    await this.ensureDirectory(GLOBAL_ASSETS_DIR);
    await this.ensureDirectory(COLLECTIONS_DIR);
    await this.loadMetadata();
    await this.reconcileOnceVaultIsListed();
  }

  /** The first check of the index against the vault, which reads the library files; null until initialization starts it. */
  private firstCheck: Promise<void> | null = null;

  /** Settles once the index was first checked against the vault and its library files, so it holds what other devices synced. */
  async vaultChecked(): Promise<void> {
    await this.initialize();
    await this.firstCheck;
  }

  /**
   * Checks the index against the vault's files once Obsidian has listed them all;
   * before the layout is ready `getFiles()` can miss files that exist. Resolves
   * after the check when the layout is already ready, at once otherwise.
   */
  private reconcileOnceVaultIsListed(): Promise<void> {
    const reconciled = this.firstCheck = new Promise<void>((resolve) => {
      this.app.workspace.onLayoutReady(() => {
        resolve(this.reconcileWithVault().then(
          // Install records older versions kept in the hidden data folder move into their collection folders.
          () => migrateInstallRecords(this.app, Object.values(this.metadata?.collections ?? {})),
          (error: unknown) => {
            console.error('[AssetService] Checking the index against the vault failed:', error);
          },
        ));
      });
    });
    return this.app.workspace.layoutReady ? reconciled : Promise.resolve();
  }

  /**
   * Runs `task` while no refresh or vault check reads or rewrites the index. An
   * import holds it from its first file write to its commit, so nothing sees or
   * saves the half-written collection. `task` must not call `refreshMetadata`.
   */
  runExclusive<T>(task: () => Promise<T>): Promise<T> {
    return this.indexLock.run(task);
  }

  /**
   * The index is read from disk once and then served from memory; `refreshMetadata`
   * re-reads it when files may have changed outside the service.
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.metadata) {
      await this.loadMetadata();
    }
  }

  private async ensureDirectory(path: string): Promise<void> {
    try {
      const folder = this.app.vault.getAbstractFileByPath(path);
      if (!folder) {
        // Only create if it doesn't exist
        await this.app.vault.createFolder(path);
      }
    } catch (e) {
      // Silently handle "folder already exists" errors
      if (e instanceof Error && !e.message.includes('already exists')) {
        console.error('[AssetService] Error creating folder:', path, e);
      }
    }
  }

  private async ensureDirectoryViaAdapter(path: string): Promise<void> {
    await ensureAdapterFolder(this.app, path);
  }

  private async ensureCollectionStructure(collectionName: string): Promise<void> {
    const collectionPath = `${COLLECTIONS_DIR}/${collectionName}`;
    await this.ensureDirectory(collectionPath);
    
    // Ensure all subdirectories exist ('assets' is global, not per collection)
    const subdirs = ['tokens', 'notes', 'statblocks', 'maps', 'characters', 'scenes', 'encounters', 'players'];
    for (const subdir of subdirs) {
      const subdirPath = `${collectionPath}/${subdir}`;
      await this.ensureDirectory(subdirPath);
    }
  }

  private getAssetPath(asset: Asset): string {
    return assetFilePath(asset);
  }

  /**
   * The cache, or the visible index of older versions while no device has written
   * the library files: once one has, those files are the library and that index
   * is frozen at an older state, which would bring back what was deleted since.
   */
  private async readStoredMetadata(): Promise<StoredMetadata> {
    const legacyApplies = !(await this.app.vault.adapter.exists(LIBRARY_FILE));
    const paths = legacyApplies ? [ASSETS_METADATA_PATH, LEGACY_ASSETS_METADATA_PATH] : [ASSETS_METADATA_PATH];
    return readStoredMetadata(this.app.vault.adapter, paths, METADATA_READ_OPTIONS);
  }

  private async loadMetadata(): Promise<void> {
    // What the cache holds is the user's library; only what Atlas adds from here on counts as worked out by itself.
    const stored = await this.readStoredMetadata();
    if (stored.kind === 'current') this.metadata = this.withoutBookkeeping(stored.metadata);
    if (stored.kind === 'legacy') await this.migrateFromOldFormat(stored.metadata);
    await this.automatically(async () => {
      if (stored.kind === 'missing') this.metadata = await this.createDefaultMetadata();
      if (stored.kind === 'unreadable') await this.startOverFromUnreadableMetadata(stored);
      if (stored.kind === 'current') await this.migrateTags();
      // Ensure all collections have uid, version, and settings fields
      await this.migrateCollectionFields();
      return stored.kind !== 'current';
    });
  }

  /** The cached index without the library bookkeeping stored beside it, which the library sync takes. */
  private withoutBookkeeping(stored: AssetMetadata): AssetMetadata {
    const fields: Record<string, unknown> = { ...stored };
    this.library.restore(parseLibraryState(fields[LIBRARY_STATE_KEY]));
    Reflect.deleteProperty(stored, LIBRARY_STATE_KEY);
    return stored;
  }

  /**
   * Runs a step Atlas takes by itself, such as loading or a vault check. Its
   * saves reach only the cache; afterwards the records it created without a
   * file are marked derived, and one save writes the library files. `step`
   * returns whether it changed the index without saving.
   */
  private async automatically(step: () => Promise<boolean>): Promise<void> {
    const before = this.metadata ? this.library.assetIds(this.metadata) : new Set<string>();
    const savesBefore = this.saveCount;
    this.automaticDepth++;
    let changed: boolean;
    try {
      changed = await step();
    } finally {
      this.automaticDepth--;
    }
    if (!this.metadata || this.automaticDepth > 0) return;
    this.library.markDerived(this.metadata, before);
    if (changed || this.saveCount !== savesBefore || this.library.awaitsFirstWrite) await this.saveMetadata();
  }

  /**
   * Keeps a copy of an index that cannot be read, then starts from an empty one
   * that the startup check against the vault fills from the collection files.
   * Without a copy the file is left alone and nothing is saved over it.
   */
  private async startOverFromUnreadableMetadata(stored: Extract<StoredMetadata, { kind: 'unreadable' }>): Promise<void> {
    console.error('[AssetService] The asset index could not be read:', stored.error);
    let copyPath: string;
    try {
      copyPath = await preserveUnreadableMetadata(this.app.vault.adapter, stored.path);
    } catch (error) {
      new Notice(t('index.unreadable', { path: stored.path }), 0);
      throw error;
    }
    new Notice(t('index.rebuilding', { path: copyPath }), 0);
    this.metadata = await this.createDefaultMetadata();
  }

  private async createDefaultMetadata(): Promise<AssetMetadata> {
    return {
      collections: { [INITIAL_COLLECTION_ID]: derivedCollectionRecord(INITIAL_COLLECTION_ID) },
      defaultCollectionId: INITIAL_COLLECTION_ID,
      assets: {},
      version: 2
    };
  }

  /**
   * Ensures all collections have the uid, version, and settings fields.
   * Called at the end of loadMetadata() to migrate legacy collections.
   */
  private async migrateCollectionFields(): Promise<void> {
    if (!this.metadata) return;

    let needsSave = false;
    for (const collection of Object.values(this.metadata.collections)) {
      if (!collection.uid) {
        collection.uid = crypto.randomUUID();
        needsSave = true;
      }
      if (collection.version === undefined || collection.version === null) {
        collection.version = 1;
        needsSave = true;
      }
      if (!collection.settings) {
        collection.settings = { conditions: [] };
        needsSave = true;
      }
      // Bundles and hand-edited indexes can carry anything, so stored resources are checked.
      // Collections without any read as their preset's (`collectionResources`).
      if (collection.settings.resources !== undefined) {
        collection.settings.resources = parseResourceDefinitions(collection.settings.resources);
      }
    }

    // Older imports could reuse a taken name; numbering them keeps every collection distinguishable.
    const takenNames: string[] = [];
    const defaultId = defaultCollectionIdOf(this.metadata);
    const defaultFirst = Object.values(this.metadata.collections)
      .sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
    for (const collection of defaultFirst) {
      const stored = typeof collection.name === 'string' && collection.name.trim() ? collection.name : prettifyIdentifier(collection.id);
      const name = uniqueCollectionName(stored, takenNames);
      if (name !== collection.name) {
        collection.name = name;
        needsSave = true;
      }
      takenNames.push(name);
    }

    if (needsSave) {
      await this.saveMetadata();
    }
  }

  private async migrateFromOldFormat(oldMetadata: LegacyAssetMetadata): Promise<void> {
    this.metadata = await this.createDefaultMetadata();
    const now = Date.now();

    for (const [id, oldToken] of Object.entries(oldMetadata.tokens)) {
      if (!isLegacyTokenRecord(oldToken)) {
        console.warn(`[AssetService] Legacy token ${id} has no name or image path, not migrated`);
        continue;
      }

      // The image stays where it is (global assets folder).
      const createdAt = typeof oldToken.createdAt === 'number' ? oldToken.createdAt : now;
      this.metadata.assets[id] = {
        id,
        type: 'token',
        name: oldToken.name,
        imagePath: oldToken.imagePath,
        tags: Array.isArray(oldToken.tags) ? oldToken.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        collection: defaultCollectionIdOf(this.metadata),
        createdAt,
        modifiedAt: typeof oldToken.modifiedAt === 'number' ? oldToken.modifiedAt : createdAt
      };
    }

    await this.saveMetadata();
  }

  /**
   * Saves the index: the library files that changed first, then the cache, so
   * the cache never holds a record its file lacks. Saves reach the disk in the
   * order they were made, each with the index as it is when its turn comes, so
   * a save waiting behind a read of the files never writes what the read replaced.
   */
  private saveMetadata(): Promise<void> {
    if (!this.metadata) return Promise.resolve();
    const persistFiles = this.automaticDepth === 0;
    this.saveCount++;
    return this.writes.run(async () => {
      if (!this.metadata) return;
      const snapshot = structuredClone(this.metadata);
      let failure: Error | null = null;
      try {
        if (persistFiles) await this.library.persist(snapshot);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
      // The cache follows even when a library file failed, so this device keeps what the files will get on the next save.
      await this.writeMetadataFile(JSON.stringify({ ...snapshot, [LIBRARY_STATE_KEY]: this.library.bookkeeping }));
      if (failure) throw failure;
    });
  }

  /**
   * Puts the index back as it was before a change whose save failed, and the
   * library files it already wrote with it, so a failed import or transfer
   * leaves nothing behind.
   */
  private async rollBackTo(previous: AssetMetadata): Promise<void> {
    this.metadata = previous;
    try {
      await this.saveMetadata();
    } catch (error) {
      console.error('[AssetService] Could not put the library files back after a failed save:', error);
    }
  }

  private async writeMetadataFile(content: string): Promise<void> {
    await this.ensureDirectoryViaAdapter(ASSETS_METADATA_PATH.substring(0, ASSETS_METADATA_PATH.lastIndexOf('/')));
    await this.app.vault.adapter.write(ASSETS_METADATA_PATH, content);
  }

  /**
   * Runs `rewrite` over both token lists of every encounter/player asset.
   * `rewrite` returns the new list, or null when it left the list untouched.
   */
  private rewriteGroupTokenRefs(rewrite: (tokens: GroupTokenRef[]) => GroupTokenRef[] | null): boolean {
    if (!this.metadata) {
      return false;
    }

    let metadataChanged = false;
    for (const asset of Object.values(this.metadata.assets)) {
      if (asset.type !== 'encounter' && asset.type !== 'player') {
        continue;
      }

      const group: { tokens: GroupTokenRef[]; data?: { tokens?: GroupTokenRef[] } } = asset;
      let assetChanged = false;

      if (Array.isArray(group.tokens)) {
        const next = rewrite(group.tokens);
        if (next) {
          group.tokens = next;
          assetChanged = true;
        }
      }

      if (group.data && Array.isArray(group.data.tokens)) {
        const next = rewrite(group.data.tokens);
        if (next) {
          group.data.tokens = next;
          assetChanged = true;
        }
      }

      if (assetChanged) {
        asset.modifiedAt = Date.now();
        metadataChanged = true;
      }
    }

    return metadataChanged;
  }

  private propagateTokenReferenceUpdate(token: TokenAsset): boolean {
    return this.rewriteGroupTokenRefs((tokens) => {
      let changed = false;
      const next = tokens.map((tokenRef) => {
        if (!tokenRef || tokenRef.id !== token.id) {
          return tokenRef;
        }

        const unchanged =
          tokenRef.name === token.name &&
          tokenRef.imagePath === token.imagePath &&
          tokenRef.statblockPath === token.statblockPath;
        if (unchanged) {
          return tokenRef;
        }

        const updatedRef: GroupTokenRef = { ...tokenRef, name: token.name, imagePath: token.imagePath };
        if (token.statblockPath !== undefined) {
          updatedRef.statblockPath = token.statblockPath;
        } else {
          delete updatedRef.statblockPath;
        }

        changed = true;
        return updatedRef;
      });

      return changed ? next : null;
    });
  }

  private removeTokenReferencesFromGroups(tokenId: string): boolean {
    return this.rewriteGroupTokenRefs((tokens) => {
      const next = tokens.filter((tokenRef) => tokenRef?.id !== tokenId);
      return next.length !== tokens.length ? next : null;
    });
  }

  private listGroups(): GroupAsset[] {
    return Object.values(this.metadata!.assets)
      .filter((asset): asset is GroupAsset => asset.type === 'encounter' || asset.type === 'player');
  }

  /** Encounters that contain any of the given token assets. */
  async getGroupsUsingTokens(tokenIds: readonly string[]): Promise<GroupAsset[]> {
    await this.ensureLoaded();
    const ids = new Set(tokenIds);
    return this.listGroups().filter((group) => groupTokenRefs(group).some((ref) => ids.has(ref.id)));
  }

  /** Deletes the given encounters if their token list is now empty. */
  private async deleteEmptiedGroups(groups: GroupAsset[]): Promise<void> {
    for (const group of groups) {
      if (groupTokenRefs(group).length === 0) await this.deleteAsset(group.id);
    }
  }

  // Collection management
  /** Creates a collection in a folder named like it; `name` must be a valid folder name no collection uses. */
  async createCollection(name: string, description?: string): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    const id = this.assertCollectionFolderName(name);

    const collection: CollectionMetadata = { ...createCollectionRecord(id), publisherId: this.vaultIdNow() };
    if (description === undefined) delete collection.description;
    else collection.description = description;

    await this.ensureCollectionStructure(id);
    this.metadata!.collections[id] = collection;
    await this.saveMetadata();
    return collection;
  }

  async getCollections(): Promise<CollectionMetadata[]> {
    await this.ensureLoaded();

    return Object.values(this.metadata!.collections);
  }

  /** The collections of the index as loaded, without waiting for it; none before it has loaded. */
  loadedCollections(): CollectionMetadata[] {
    return Object.values(this.metadata?.collections ?? {});
  }

  /** The collection new content goes to when none is chosen; it cannot be deleted. */
  getDefaultCollectionId(): string {
    return defaultCollectionIdOf(this.metadata);
  }

  /** The default collection of the loaded index, for code that has no service at hand. */
  static defaultCollectionId(): string {
    return defaultCollectionIdOf(AssetService.instance?.metadata ?? null);
  }

  /** Registers a record for a collection id that assets already point at. */
  private async ensureCollectionRecord(id: string): Promise<void> {
    if (this.metadata!.collections[id]) return;
    // The folder first: a vault check forgets records whose folder is missing.
    await this.ensureCollectionStructure(id);
    this.metadata!.collections[id] ??= derivedCollectionRecord(id);
    await this.saveMetadata();
  }

  /**
   * Renames a collection together with its folder, since a collection is named
   * like its folder. Every stored path into the folder follows, and the vault
   * rename event carries the new paths to open maps and map files. Returns the
   * collection as renamed.
   */
  async renameCollection(collectionId: string, name: string): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    if (name.trim() === collectionId) return collection;
    const id = this.assertCollectionFolderName(name, collectionId);
    await this.moveCollectionFolder(collectionId, id);
    return this.metadata!.collections[id]!;
  }

  /** The trimmed `name` as a collection folder name; throws when it is invalid or taken by another collection. */
  private assertCollectionFolderName(name: string, exceptId?: string): string {
    const problem = collectionNameProblem(name);
    if (problem) throw new Error(problem);
    const id = name.trim();
    this.assertCollectionNameFree(id, exceptId);
    if (this.isCollectionFolderTaken(id, exceptId)) throw new Error(`A folder named "${id}" already exists in the collections folder`);
    return id;
  }

  /** Whether a folder other than `exceptId`'s in the collections folder has this name, compared without case like macOS and Windows do. */
  private isCollectionFolderTaken(id: string, exceptId?: string): boolean {
    const key = collectionNameKey(id);
    return (this.app.vault.getFolderByPath(COLLECTIONS_DIR)?.children ?? [])
      .some((child) => child.name !== exceptId && collectionNameKey(child.name) === key);
  }

  /**
   * Renames a collection's folder and moves its record along. Resolves once the
   * vault has renamed the folder; the vault's rename event may move the record
   * first, as for a folder renamed in Obsidian.
   */
  private async moveCollectionFolder(oldId: string, newId: string): Promise<void> {
    const folder = this.app.vault.getFolderByPath(collectionFolderPath(oldId));
    if (folder) await this.renameInVault(folder, collectionFolderPath(newId));
    if (!this.metadata!.collections[oldId]) return;
    // The install record lies in the folder and moved with it.
    moveCollectionRecord(this.metadata!, oldId, newId);
    await this.saveMetadata();
  }

  /**
   * Renames through Obsidian, so links to the folder's notes follow. Obsidian
   * may first ask whether to update those links and only then settle its
   * promise; the rename itself is done once the vault reports it, so Atlas
   * never waits for that answer.
   */
  private renameInVault(folder: TFolder, newPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const renamed = this.app.vault.on('rename', (file) => {
        if (file.path === newPath) settle(resolve);
      });
      const settle = (done: () => void): void => {
        this.app.vault.offref(renamed);
        done();
      };
      this.app.fileManager.renameFile(folder, newPath).then(
        () => settle(resolve),
        (error: unknown) => settle(() => reject(error instanceof Error ? error : new Error(String(error)))),
      );
    });
  }


  /**
   * Gives every collection its folder's name: the folder takes the collection's
   * name where it can (older versions named folders `default` or `winter-camp`),
   * otherwise the collection takes the folder's name. Returns whether any changed.
   */
  private async matchFolderNames(onlyId?: string): Promise<boolean> {
    const folders = (this.app.vault.getFolderByPath(COLLECTIONS_DIR)?.children ?? [])
      .filter((child) => child instanceof TFolder)
      .map((child) => child.name);
    const fixes = planFolderNameFixes(this.metadata!, folders)
      .filter((fix) => (onlyId === undefined || fix.id === onlyId) && !this.folderRenames.has(fix.id));
    let renamed = false;
    for (const fix of fixes) {
      const collection = this.metadata!.collections[fix.id];
      if (!collection) continue;
      if (fix.kind === 'rename-folder') {
        // Not awaited: the caller holds the index, and the record follows the folder by itself.
        this.folderRenames.add(fix.id);
        const rename = this.moveCollectionFolder(fix.id, fix.folder).finally(() => this.folderRenames.delete(fix.id));
        runInBackground(rename, `Renaming the folder of collection "${collection.name}"`);
        continue;
      }
      collection.name = fix.id;
      renamed = true;
    }
    if (renamed) await this.saveMetadata();
    return renamed;
  }

  /**
   * Gives a collection whose name was set elsewhere, such as by an import, a
   * folder of that name, or takes its folder's name when the name is taken.
   * The folder is renamed in the background; returns the collection as it is now.
   */
  async matchCollectionFolder(collectionId: string): Promise<CollectionMetadata | null> {
    await this.ensureLoaded();
    const uid = this.metadata!.collections[collectionId]?.uid;
    await this.matchFolderNames(collectionId);
    return Object.values(this.metadata!.collections).find((collection) => collection.uid === uid) ?? null;
  }

  /**
   * Follows a collection folder renamed in the vault: the record moves to the
   * new folder name as its id and name, and every stored path into the folder
   * is rewritten. A folder moved out of the collections folder is no longer a
   * collection. Returns whether `oldPath` was a collection folder.
   */
  async followCollectionFolderRename(oldPath: string, newPath: string): Promise<boolean> {
    await this.ensureLoaded();
    const oldId = collectionIdOfFolder(oldPath);
    const newId = collectionIdOfFolder(newPath);
    if (!oldId || oldId === newId || !this.metadata!.collections[oldId]) return false;

    if (newId) moveCollectionRecord(this.metadata!, oldId, newId);
    else forgetCollection(this.metadata!, oldId);
    for (const id of Object.keys(this.metadata!.collections)) {
      if (!this.app.vault.getFolderByPath(collectionFolderPath(id))) await this.ensureCollectionStructure(id);
    }
    await this.saveMetadata();
    return true;
  }

  /**
   * Brings the index in line with the vault's files after changes Atlas did not
   * make itself: collection folders renamed, added or deleted in the file
   * manager or by a sync tool, scenes moved to another collection, asset files
   * added, moved or deleted. `deleted` holds the paths deleted since the last
   * check; only those remove records whose data lives in the index. Runs while
   * no import or refresh holds the index.
   */
  reconcileWithVault(deleted: ReadonlySet<string> = new Set()): Promise<VaultReconciliation> {
    return this.indexLock.run(async () => {
      await this.ensureLoaded();
      const check: { result?: VaultReconciliation } = {};
      await this.automatically(async () => {
        await this.matchFolderNames();
        // Library files first: they are the library, the index only this device's cache of them.
        const library = await this.readLibraryFiles();
        const readings = await readVault(this.app, this.metadata!);
        // From the listing on, nothing awaits until the index is changed, so no other edit interleaves.
        const listing = listVault(this.app, readings, deleted, this.recordedAssets());
        const result = reconcileIndex(this.metadata!, listing);
        if (library.changed) result.changed = true;
        result.folderMoves.unshift(...library.folderMoves);
        check.result = result;
        return result.changed;
      });
      const reconciled = check.result!;
      for (const id of reconciled.missingFolders) await this.ensureCollectionStructure(id);
      await this.applyVaultFileOps(reconciled);
      if (reconciled.changed) this.notifyReconciled(reconciled);
      return reconciled;
    });
  }

  /** Assets whose record file this device has read or written; their art or map missing for now does not remove them. */
  private recordedAssets(): Set<string> {
    const recorded = new Set<string>();
    for (const asset of Object.values(this.metadata!.assets)) {
      const path = recordFilePath(asset);
      if (path && this.library.hasRecordFile(asset.id, path) && this.app.vault.getFileByPath(path)) recorded.add(asset.id);
    }
    return recorded;
  }

  /** Moves and trashes the JSON copies the vault check asked for; a failure only skips that file. */
  private async applyVaultFileOps({ ops }: VaultReconciliation): Promise<void> {
    for (const { from, to } of ops.moves) {
      const file = this.app.vault.getFileByPath(from);
      if (!file) continue;
      try {
        await this.ensureDirectory(to.slice(0, to.lastIndexOf('/')));
        await this.app.fileManager.renameFile(file, to);
      } catch (error) {
        console.error(`[AssetService] Could not move ${from} to ${to}:`, error);
      }
    }
    for (const path of ops.trash) await this.trashFileIfPresent(path);
  }

  /** Calls `listener` after every vault check that changed the index; returns the unsubscribe function. */
  onReconciled(listener: (result: VaultReconciliation) => void): () => void {
    this.reconciledListeners.add(listener);
    return () => this.reconciledListeners.delete(listener);
  }

  private notifyReconciled(result: VaultReconciliation): void {
    for (const listener of this.reconciledListeners) {
      try {
        listener(result);
      } catch (error) {
        console.error('[AssetService] A vault check listener failed:', error);
      }
    }
  }

  async deleteCollection(collectionId: string): Promise<void> {
    if (!this.metadata || collectionId === defaultCollectionIdOf(this.metadata)) {
      return; // The default collection stays
    }

    // Delete all assets in the collection
    const assetsToDelete = Object.values(this.metadata.assets)
      .filter(asset => asset.collection === collectionId);
    
    for (const asset of assetsToDelete) {
      await this.deleteAsset(asset.id);
    }

    // Delete collection folder
    const collectionPath = `${COLLECTIONS_DIR}/${collectionId}`;
    const folder = this.app.vault.getAbstractFileByPath(collectionPath);
    if (folder instanceof TFolder) {
      await trashVaultItem(this.app, folder);
    }

    // Remove from metadata
    delete this.metadata.collections[collectionId];
    await this.saveMetadata();
  }

  // Generic asset management
  async addAsset(asset: NewAsset): Promise<Asset> {
    const newAsset: Asset = { ...asset, ...this.createAssetIdentity(asset.type) };
    return this.registerAsset(newAsset);
  }

  /** A new asset id; unique within this vault. */
  static newAssetId(type: Asset['type']): string {
    return `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private createAssetIdentity(type: Asset['type']): Pick<BaseAsset, 'id' | 'createdAt' | 'modifiedAt'> {
    const now = Date.now();
    return {
      id: AssetService.newAssetId(type),
      createdAt: now,
      modifiedAt: now
    };
  }

  /** Persists a fully built asset: data file, metadata entry and, for a token the user imported, the onboarding flag. */
  private async registerAsset<A extends Asset>(newAsset: A, userImport = true): Promise<A> {
    await this.registerAssets([newAsset], userImport);
    return newAsset;
  }

  /**
   * Registers several new assets with a single save of the index, e.g. a batch
   * of an import: saving once per asset rewrites the whole index every time,
   * which grows with the square of the import's size.
   */
  async addAssets(assets: readonly NewAsset[]): Promise<Asset[]> {
    const newAssets = assets.map((asset): Asset => ({ ...asset, ...this.createAssetIdentity(asset.type) }));
    await this.registerAssets(newAssets);
    return newAssets;
  }

  private async registerAssets(newAssets: readonly Asset[], userImport = true): Promise<void> {
    await this.ensureLoaded();

    for (const newAsset of newAssets) {
      if (newAsset.type !== 'token' && newAsset.type !== 'note' && !newAsset.filePath) {
        newAsset.filePath = this.getAssetPath(newAsset);
      }
      await this.ensureCollectionRecord(newAsset.collection);
    }

    for (const newAsset of newAssets) this.metadata!.assets[newAsset.id] = newAsset;
    try {
      await this.saveMetadata();
    } catch (error) {
      // One write holds every asset, so one token tells whether all were saved
      const token = newAssets.find((asset): asset is TokenAsset => asset.type === 'token');
      if (!token || newAssets.some((asset) => asset.type !== 'token')) throw error;
      if (!await wasTokenRegistrationSaved(this.app, token)) {
        const previous = structuredClone(this.metadata!);
        for (const newAsset of newAssets) delete previous.assets[newAsset.id];
        await this.rollBackTo(previous);
        throw error;
      }
    }

    if (userImport && newAssets.some((asset) => asset.type === 'token')) SettingsService.forApp(this.app)?.markTokenImported();
  }

  async getAssets<T extends Asset['type']>(collection: string | undefined, type: T): Promise<AssetOfType<T>[]>;
  async getAssets(collection?: string, type?: Asset['type']): Promise<Asset[]>;
  async getAssets(collection?: string, type?: Asset['type']): Promise<Asset[]> {
    await this.ensureLoaded();

    let assets = Object.values(this.metadata!.assets);
    if (collection) {
      // Case-insensitive collection comparison
      const filteredByCollection = assets.filter(asset => asset.collection.toLowerCase() === collection.toLowerCase());
      assets = filteredByCollection;
    }
    
    if (type) {
      const filteredByType = assets.filter(asset => asset.type === type);
      assets = filteredByType;
    }

    return assets;
  }

  async getAssetById(id: string): Promise<Asset | null> {
    await this.ensureLoaded();

    return this.metadata!.assets[id] || null;
  }

  async updateAsset(id: string, updates: AssetUpdates): Promise<void> {
    await this.ensureLoaded();

    const asset = this.metadata!.assets[id];
    if (!asset) return;

    // Properties explicitly set to undefined in updates are removed from the asset
    const keysToRemove = Object.entries<unknown>(updates)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);

    const updatedAsset: Asset = Object.assign({}, asset, updates, { modifiedAt: Date.now() });
    for (const key of keysToRemove) {
      Reflect.deleteProperty(updatedAsset, key);
    }

    this.metadata!.assets[id] = updatedAsset;

    if (updatedAsset.type === 'token') {
      this.propagateTokenReferenceUpdate(updatedAsset);
    }

    // The save writes the record file along with every other record that changed.
    await this.saveMetadata();
  }

  /**
   * The record file of an asset whose files are written outside the index
   * (transfers, imports), so they land in one journalled step: the whole record,
   * as saving the index would write it. Null when the record's payload is not
   * loaded yet and its file exists, which only that file holds.
   */
  pendingRecordFile(asset: Asset): { path: string; content: string } | null {
    const path = recordFilePath(asset);
    if (!path) return null;
    if (isPayloadUnread(asset) && this.app.vault.getFileByPath(path)) return null;
    return { path, content: serializeRecord(asset) };
  }

  async deleteAsset(id: string): Promise<void> {
    await this.ensureLoaded();

    const asset = this.metadata!.assets[id];
    if (!asset) return;

    // Delete the asset file
    try {
      const assetPath = this.getAssetPath(asset);
      const file = this.app.vault.getAbstractFileByPath(assetPath);
      if (file instanceof TFile) {
        await trashVaultItem(this.app, file);
      }
    } catch (error) {
      console.error('[AssetService] Error deleting asset file:', error);
    }

    // For scene assets, also delete the map file and close any open leaves
    if (asset.type === 'scene') {
      // Load the scene data from the JSON file if not already loaded
      let sceneData = asset.data;
      if (!sceneData) {
        try {
          const sceneJsonPath = this.getAssetPath(asset);
          const sceneJsonFile = this.app.vault.getAbstractFileByPath(sceneJsonPath);
          if (sceneJsonFile instanceof TFile) {
            const parsed: unknown = JSON.parse(await this.app.vault.read(sceneJsonFile));
            if (isRecord(parsed) && typeof parsed.mapPath === 'string') {
              sceneData = { mapPath: parsed.mapPath };
            }
          }
        } catch (error) {
          console.error('[AssetService] Error loading scene data:', error);
        }
      }
      
      const mapPath = sceneData?.mapPath;
      if (mapPath) {
        try {
          // Delete the map file
          const mapFile = this.app.vault.getAbstractFileByPath(mapPath);
          if (mapFile instanceof TFile) {
            // Close any leaves showing this file
            const leaves = this.app.workspace.getLeavesOfType('atlas-view');
            for (const leaf of leaves) {
              const state = leaf.view?.getState?.();
              if (state?.file === mapPath) {
                leaf.detach();
              }
            }
            
            // Also check markdown leaves in case the .atlasmap file is open there
            const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of markdownLeaves) {
              const state = leaf.view?.getState?.();
              if (state?.file === mapPath) {
                leaf.detach();
              }
            }
            
            await trashVaultItem(this.app, mapFile);
          }
        } catch (error) {
          console.error('[AssetService] Error deleting scene map file:', error);
        }
      }
      try {
        await trashSceneSnapshots(this.app, asset);
      } catch (error) {
        console.error('[AssetService] Error deleting scene snapshots:', error);
      }
    }

    const emptiedGroups = asset.type === 'token' ? await this.getGroupsUsingTokens([asset.id]) : [];
    if (asset.type === 'token') {
      this.removeTokenReferencesFromGroups(asset.id);
      await this.trashFileIfPresent(asset.thumbnailPath);
    }

    // Remove from metadata
    delete this.metadata!.assets[id];
    await this.saveMetadata();

    await this.deleteEmptiedGroups(emptiedGroups);
  }

  private async trashFileIfPresent(path: string | undefined): Promise<void> {
    if (!path) return;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    try {
      await trashVaultItem(this.app, file);
    } catch (error) {
      console.error('[AssetService] Error deleting file:', path, error);
    }
  }

  /** Vault path of the file that backs `asset`: the token image, the map's JSON record, or the JSON payload of other types. */
  getAssetFilePath(asset: Asset): string {
    return this.getAssetPath(asset);
  }

  async getCollection(collectionId: string): Promise<CollectionMetadata | null> {
    await this.ensureLoaded();
    return this.metadata!.collections[collectionId] ?? null;
  }

  async findCollectionByUid(uid: string): Promise<CollectionMetadata | null> {
    await this.ensureLoaded();
    return Object.values(this.metadata!.collections).find((collection) => collection.uid === uid) ?? null;
  }

  /** Whether the starter tokens were added to this vault, on any device. */
  async starterTokensAdded(): Promise<boolean> {
    await this.ensureLoaded();
    return this.metadata!.starterTokensAdded === true;
  }

  /** Records that the starter tokens were added, before the first is written, so no device adds them again. */
  async markStarterTokensAdded(): Promise<void> {
    await this.ensureLoaded();
    if (this.metadata!.starterTokensAdded) return;
    this.metadata!.starterTokensAdded = true;
    await this.saveMetadata();
  }

  /** This vault's identity as a publisher, when it has one; comparing with it never makes one. */
  async knownVaultId(): Promise<string | null> {
    await this.ensureLoaded();
    return this.metadata!.vaultId ?? null;
  }

  /** This vault's identity as a publisher of collections, made and saved when it publishes for the first time. */
  async getVaultId(): Promise<string> {
    await this.ensureLoaded();
    if (this.metadata!.vaultId) return this.metadata!.vaultId;
    const id = this.vaultIdNow();
    await this.saveMetadata();
    return id;
  }

  /**
   * This vault's publisher id, made when first needed (a collection created or
   * published) rather than at start: a device that starts before sync delivers
   * the library would otherwise make an id of its own and write it over the vault's.
   */
  private vaultIdNow(): string {
    this.metadata!.vaultId ??= crypto.randomUUID();
    return this.metadata!.vaultId;
  }

  /** Whether another collection than `exceptId` already uses `name`; names are compared without case. */
  async isCollectionNameTaken(name: string, exceptId?: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.findCollectionByName(name, exceptId) !== undefined;
  }

  /** `name`, or `name (2)`, `name (3)`, … when another collection already uses it. */
  async freeCollectionName(name: string, exceptId?: string): Promise<string> {
    await this.ensureLoaded();
    return this.numberedCollectionName(name, exceptId);
  }

  /**
   * A folder name for a new collection called `name`: the name itself, or
   * `name (2)`, `name (3)`, … while a collection or a leftover folder has it,
   * so a deleted collection's files never leak into the new one.
   */
  async freeCollectionIdFor(name: string): Promise<string> {
    await this.ensureLoaded();
    const base = collectionFolderName(name);
    let id = base;
    for (let n = 2; this.findCollectionByName(id) || this.isCollectionFolderTaken(id); n++) id = `${base} (${n})`;
    return id;
  }

  private numberedCollectionName(name: string, exceptId?: string): string {
    return numberedCollectionName(this.metadata, name, exceptId);
  }

  private findCollectionByName(name: string, exceptId?: string): CollectionMetadata | undefined {
    const wanted = collectionNameKey(name);
    return Object.values(this.metadata!.collections)
      .find((collection) => collection.id !== exceptId && collectionNameKey(collection.name) === wanted);
  }

  private assertCollectionNameFree(name: string, exceptId?: string): void {
    if (this.findCollectionByName(name, exceptId)) throw new Error(`A collection named "${name.trim()}" already exists`);
  }

  /** Stores the release a publisher just exported, once the export has been written. */
  async recordCollectionRelease(
    collectionId: string,
    release: { version: number; releasedAt: number; author?: string | undefined; coverPath?: string | undefined },
  ): Promise<void> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    collection.version = release.version;
    collection.releasedAt = release.releasedAt;
    if (release.author === undefined) delete collection.author;
    else collection.author = release.author;
    if (release.coverPath === undefined) delete collection.coverPath;
    else collection.coverPath = release.coverPath;
    collection.publisherId = this.vaultIdNow();
    await this.saveMetadata();
  }

  /**
   * Gives a collection Atlas worked out from its folder an identity of its own. Its derived uid
   * is the same in every vault that has a folder of that name, so a bundle carrying it would
   * be taken for an update of an unrelated collection elsewhere. Saved to its file at once.
   */
  async ensureOwnCollectionUid(collectionId: string): Promise<void> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection || collection.uid !== derivedCollectionRecord(collectionId).uid) return;
    collection.uid = crypto.randomUUID();
    collection.modifiedAt = Date.now();
    await this.saveMetadata();
  }

  /**
   * Turns a copy of someone else's collection into this vault's own collection:
   * it gets a new identity and name, so it no longer receives the original's
   * updates and its exports are this vault's releases.
   */
  async forkCollection(collectionId: string, name: string, uid: string): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    const id = name.trim() === collectionId ? collectionId : this.assertCollectionFolderName(name, collectionId);
    collection.uid = uid;
    collection.version = 1;
    collection.publisherId = this.vaultIdNow();
    delete collection.releasedAt;
    collection.modifiedAt = Date.now();
    if (id !== collectionId) await this.moveCollectionFolder(collectionId, id);
    await this.saveMetadata();
    return this.metadata!.collections[id]!;
  }

  /**
   * Records an imported collection and its assets in one metadata save. The
   * files must already be in the vault at the paths the assets reference.
   * Returns the collection as recorded, with tags from older bundles grouped.
   */
  async commitCollectionImport({ collectionId, collection, upsert, remove }: CollectionImportCommit): Promise<CollectionMetadata> {
    await this.ensureLoaded();
    this.assertCollectionNameFree(collection.name, collectionId);
    await this.ensureCollectionStructure(collectionId);
    // Changes go to a copy that replaces the index only once it is saved, so a failed save leaves nothing half-applied.
    const current = this.metadata!;
    const assets = { ...current.assets };
    for (const id of remove) delete assets[id];
    for (const asset of upsert) assets[asset.id] = { ...asset, collection: collectionId };
    const collectionAssets = Object.values(assets).filter((asset) => asset.collection === collectionId);
    const recorded: CollectionMetadata = {
      ...collection,
      id: collectionId,
      // A bundle update can drop the field; tags then stay as the bundle left them.
      tags: groupLegacyTags(collection.tags ?? {}, collectionAssets) ?? collection.tags,
    };
    const next: AssetMetadata = { ...current, collections: { ...current.collections, [collectionId]: recorded }, assets };
    this.metadata = next;
    try {
      await this.saveMetadata();
    } catch (error) {
      await this.rollBackTo(current);
      throw error;
    }
    if (upsert.some((asset) => asset.type === 'token')) SettingsService.forApp(this.app)?.markTokenImported();
    return recorded;
  }

  /**
   * Records assets moved or copied into a collection, with the tags they carry,
   * in one save. Their files, record files included (`pendingRecordFile`),
   * must already be in place. A failed save leaves the index as it was.
   */
  async commitAssetTransfer({ collectionId, records, tags }: AssetTransferCommit): Promise<void> {
    await this.ensureLoaded();
    const current = this.metadata!;
    const collection = current.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    const collectionTags = { ...collection.tags };
    for (const tag of tags) collectionTags[tagKey(tag.group, tag.id)] ??= tag;
    const assets = { ...current.assets };
    for (const record of records) assets[record.id] = record;
    this.metadata = {
      ...current,
      collections: { ...current.collections, [collectionId]: { ...collection, tags: collectionTags, modifiedAt: Date.now() } },
      assets,
    };
    try {
      await this.saveMetadata();
    } catch (error) {
      await this.rollBackTo(current);
      throw error;
    }
  }

  // Backward compatibility methods
  /**
   * `userImport: false` adds a token Atlas provides, which does not count as the
   * user's first import; `id` gives such a token the same id on every device.
   */
  async addTokenAsset(
    asset: Omit<TokenAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type'>,
    { userImport = true, id }: { userImport?: boolean; id?: string } = {},
  ): Promise<TokenAsset> {
    const identity = this.createAssetIdentity('token');
    return this.registerAsset<TokenAsset>({ ...asset, type: 'token', ...identity, id: id ?? identity.id }, userImport);
  }

  async getTokenAssets(): Promise<TokenAsset[]> {
    return this.getAssets(undefined, 'token');
  }

  async deleteTokenAsset(id: string): Promise<void> {
    await this.deleteAsset(id);
  }

  async updateTokenAsset(id: string, updates: Partial<Omit<TokenAsset, 'id' | 'createdAt' | 'type' | 'collection'>>): Promise<void> {
    await this.updateAsset(id, updates);
  }

  async createEncounter(encounterData: Omit<EncounterAsset, 'id' | 'createdAt' | 'modifiedAt' | 'type'>): Promise<EncounterAsset> {
    const encounter: EncounterAsset = {
      ...encounterData,
      ...this.createAssetIdentity('encounter'),
      type: 'encounter',
      data: {
        ...encounterData.data,
        tokens: encounterData.tokens,
        ...(encounterData.difficulty !== undefined && { difficulty: encounterData.difficulty }),
        ...(encounterData.formation !== undefined && { formation: encounterData.formation }),
      }
    };

    return this.registerAsset(encounter);
  }

  /**
   * Edits asset records in place, e.g. to rewrite paths after a vault rename.
   * `rewrite` returns whether it changed the asset; metadata is saved once if any did.
   */
  async rewriteAssets(rewrite: (asset: Asset) => boolean): Promise<boolean> {
    if (!this.metadata) return false;

    let changed = false;
    for (const asset of Object.values(this.metadata.assets)) {
      if (rewrite(asset)) changed = true;
    }

    if (changed) {
      await this.saveMetadata();
    }
    return changed;
  }

  /**
   * Takes in library files changed on disk (by a sync tool, by hand), after any
   * import in progress has finished. Checking the index against the rest of the
   * vault is left to the vault check.
   */
  async refreshMetadata(): Promise<void> {
    await this.ensureLoaded();
    await this.indexLock.run(() => this.automatically(async () => (await this.readLibraryFiles()).changed));
  }

  /** Reads the library files that changed into the index. Open maps hear of changed collection settings. */
  private async readLibraryFiles(): Promise<LibraryMergeResult> {
    // Inside the write queue, so no save writes a file while it is read.
    const merged = await this.writes.run(() => this.library.read(this.metadata!));
    for (const id of merged.changedCollections) this.app.workspace.trigger('atlas-vtt:collection-settings-changed', id);
    if (merged.retryAt !== null) this.checkAgainAt(merged.retryAt);
    return merged;
  }

  /** Checks the vault again once files that look like copies have stood long enough to be taken in. */
  private checkAgainAt(time: number): void {
    if (this.copyCheck !== null) window.clearTimeout(this.copyCheck);
    this.copyCheck = window.setTimeout(() => {
      this.copyCheck = null;
      runInBackground(this.reconcileWithVault().then(() => undefined), 'Taking in copied Atlas files');
    }, Math.max(0, time - libraryClock.now()) + 100);
  }

  /** Stops a check waiting for copies; called when the plugin unloads. */
  cancelScheduledChecks(): void {
    if (this.copyCheck !== null) window.clearTimeout(this.copyCheck);
    this.copyCheck = null;
  }

  /**
   * Gives every collection a tag registry, filled from its assets' tags when it
   * had none, and moves ungrouped tags into their tag groups.
   */
  private async migrateTags(): Promise<void> {
    if (!this.metadata) return;
    const assets = Object.values(this.metadata.assets);
    let changed = false;
    for (const collection of Object.values(this.metadata.collections)) {
      const collectionAssets = assets.filter((asset) => (asset.collection || defaultCollectionIdOf(this.metadata)) === collection.id);
      if (!collection.tags) {
        collection.tags = {};
        changed = true;
        for (const tagName of new Set(collectionAssets.flatMap((asset) => asset.tags ?? []))) {
          collection.tags[tagIdOf(tagName)] = { id: tagIdOf(tagName), name: tagName };
        }
      }
      const grouped = groupLegacyTags(collection.tags, collectionAssets);
      if (grouped) {
        collection.tags = grouped;
        changed = true;
      }
    }
    if (changed) await this.saveMetadata();
  }

  /** The tags of a group: registered in any collection or carried by any asset of the group, sorted by name. */
  async getAllTags(group: TagGroup): Promise<string[]> {
    await this.ensureLoaded();
    if (!this.metadata) return [];

    const tags = new Set<string>();
    for (const collection of Object.values(this.metadata.collections)) {
      for (const tag of Object.values(collection.tags ?? {})) {
        if (tag.group === group) tags.add(tag.name);
      }
    }
    for (const asset of Object.values(this.metadata.assets)) {
      if (tagGroupOf(asset.type) === group) asset.tags.forEach((tag) => tags.add(tag));
    }
    return Array.from(tags).sort();
  }

  /** The tags a collection registers in a group. */
  async getCollectionTags(collectionId: string, group: TagGroup): Promise<TagMetadata[]> {
    await this.ensureLoaded();
    const tags = this.metadata?.collections[collectionId]?.tags ?? {};
    return Object.values(tags).filter((tag) => tag.group === group);
  }

  /** Registers a tag in a collection's group; an existing tag of that name is returned as it is. */
  async createTag(collectionId: string, group: TagGroup, tagName: string): Promise<TagMetadata> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');

    const collection = this.metadata.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    collection.tags ??= {};

    const id = tagIdOf(tagName);
    const existing = collection.tags[tagKey(group, id)];
    if (existing) return existing;

    const tag: TagMetadata = { id, name: tagName.trim(), group };
    collection.tags[tagKey(group, id)] = tag;
    await this.saveMetadata();
    return tag;
  }

  /**
   * Renames a tag. Its id follows the name, and every asset of the group in the
   * collection that carries the tag (by id or, as creators store it, by name) is retagged.
   */
  async renameTag(collectionId: string, group: TagGroup, tagId: string, name: string): Promise<TagMetadata> {
    await this.ensureLoaded();
    const tags = this.metadata!.collections[collectionId]?.tags;
    const tag = tags?.[tagKey(group, tagId)];
    if (!tags || !tag) throw new Error(`Tag ${tagId} not found`);

    const renamed: TagMetadata = { ...tag, id: tagIdOf(name), name: name.trim(), group };
    if (renamed.id !== tagId && tags[tagKey(group, renamed.id)]) throw new Error(`A tag named "${name}" already exists`);
    delete tags[tagKey(group, tagId)];
    tags[tagKey(group, renamed.id)] = renamed;

    const retag = (value: string): string => (value === tag.id ? renamed.id : value === tag.name ? renamed.name : value);
    for (const asset of this.assetsOfTagGroup(collectionId, group)) asset.tags = asset.tags.map(retag);
    await this.saveMetadata();
    return renamed;
  }

  /** Deletes a tag from a collection's group and removes it from the group's assets. */
  async deleteTag(collectionId: string, group: TagGroup, tagId: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');

    const tags = this.metadata.collections[collectionId]?.tags;
    const tag = tags?.[tagKey(group, tagId)];
    if (!tags || !tag) return;

    delete tags[tagKey(group, tagId)];
    for (const asset of this.assetsOfTagGroup(collectionId, group)) {
      asset.tags = asset.tags.filter((value) => !hasAssetTag([value], tag));
    }
    await this.saveMetadata();
  }

  private assetsOfTagGroup(collectionId: string, group: TagGroup): Asset[] {
    return Object.values(this.metadata!.assets)
      .filter((asset) => asset.collection === collectionId && tagGroupOf(asset.type) === group);
  }

  /**
   * Update asset tags
   */
  async updateAssetTags(assetId: string, tags: string[]): Promise<void> {
    await this.ensureLoaded();
    if (!this.metadata) throw new Error('Metadata not loaded');
    
    const asset = this.metadata.assets[assetId];
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    
    asset.tags = tags;
    asset.modifiedAt = Date.now();
    
    await this.saveMetadata();
  }

  /** Update the settings for a collection */
  async updateCollectionSettings(collectionId: string, settings: Partial<CollectionSettings>): Promise<void> {
    await this.ensureLoaded();
    const collection = this.metadata!.collections[collectionId];
    if (!collection) throw new Error(`Collection ${collectionId} not found`);
    collection.settings = { ...collection.settings, ...settings };
    collection.modifiedAt = Date.now();
    // Open maps apply the change at once; the write to disk follows
    this.app.workspace.trigger('atlas-vtt:collection-settings-changed', collectionId);
    await this.saveMetadata();
  }

  /** Get settings for a collection, returns defaults if none set */
  getCollectionSettings(collectionId: string): CollectionSettings {
    const collection = this.metadata?.collections[collectionId];
    return collection?.settings ?? { conditions: [] };
  }

  /** The library token drawn with this artwork, read from the loaded index. */
  findTokenAssetByImagePath(imagePath: string): TokenAsset | null {
    if (!this.metadata) return null;
    return Object.values(this.metadata.assets).find(
      (asset): asset is TokenAsset => asset.type === 'token' && asset.imagePath === imagePath,
    ) ?? null;
  }

  /** Get the collection ID that a given map file belongs to */
  getCollectionForMap(mapFilePath: string): string | null {
    if (!this.metadata) return null;
    // Maps live under atlas-vtt/collections/{collectionId}/scenes/
    const match = mapFilePath.match(/collections\/([^/]+)\//);
    const candidate = match?.[1];
    if (!candidate) {
      return null;
    }
    if (this.metadata.collections[candidate]) {
      return candidate;
    }
    const normalized = candidate.toLowerCase();
    return Object.keys(this.metadata.collections).find((id) => id.toLowerCase() === normalized) ?? null;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    AssetService.instance?.cancelScheduledChecks();
    AssetService.instance = null;
  }
}
