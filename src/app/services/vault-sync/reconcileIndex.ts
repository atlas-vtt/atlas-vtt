import type { AssetMetadata } from '../AssetService';
import { derivedCollectionRecord, defaultCollectionIdOf, INITIAL_COLLECTION_ID } from '../collectionRecords';
import type { PathMove } from '../renamedPaths';
import { adoptUnindexedFiles } from './assetAdoption';
import { indexedPaths } from './assetFiles';
import { relinkAssets, type VaultFileOps } from './assetRelink';
import { followCollectionFolders, forgetCollectionsWithoutFolder } from './collectionFolders';
import { adoptTokenArtwork, dropShadowedRecoveries, tidyRecoveredTokens } from './recoveredTokens';

/** What the vault holds, as the check against the index sees it. */
export interface VaultListing {
  /** Every file in the vault, including ones the adapter found that Obsidian had not listed yet. */
  files: ReadonlySet<string>;
  /** The folders directly inside the collections folder. */
  collectionFolders: ReadonlySet<string>;
  /** Paths deleted since the last check. */
  deleted: ReadonlySet<string>;
  /** Parsed content of the unindexed asset JSON files. */
  json: ReadonlyMap<string, unknown>;
  /** Assets whose record file this device has read or written; art or a map missing for now does not remove them. */
  recorded?: ReadonlySet<string>;
}

export interface VaultReconciliation {
  /** Whether the index changed and has to be saved. */
  changed: boolean;
  /** Collection folders that moved; the rest of the vault may reference their files by the old paths. */
  folderMoves: PathMove[];
  /** Files found at a new place. */
  fileMoves: PathMove[];
  /** File operations that bring the collection folders in line with the index. */
  ops: VaultFileOps;
  /** Collections that have a record but no folder yet, such as a new default collection. */
  missingFolders: string[];
}

/** Every asset belongs to a collection with a record, and there is always a collection. */
function ensureCollectionRecords(metadata: AssetMetadata): boolean {
  let changed = false;
  if (Object.keys(metadata.collections).length === 0) {
    metadata.collections[INITIAL_COLLECTION_ID] = derivedCollectionRecord(INITIAL_COLLECTION_ID);
    metadata.defaultCollectionId = INITIAL_COLLECTION_ID;
    changed = true;
  }
  const fallback = defaultCollectionIdOf(metadata);
  for (const asset of Object.values(metadata.assets)) {
    if (!asset.collection) {
      asset.collection = fallback;
      changed = true;
    }
    if (metadata.collections[asset.collection]) continue;
    metadata.collections[asset.collection] = derivedCollectionRecord(asset.collection);
    changed = true;
  }
  return changed;
}

/**
 * Brings the index in line with the vault's files, in place and synchronously,
 * so no other change to the index can interleave: collection folders first
 * (moved, new, gone), then each record (moved, deleted, in another collection),
 * then files no record knows yet.
 */
export function reconcileIndex(metadata: AssetMetadata, listing: VaultListing, now = Date.now()): VaultReconciliation {
  const { files, collectionFolders, deleted } = listing;
  const ops: VaultFileOps = { moves: [], trash: [] };

  const folders = followCollectionFolders(metadata, collectionFolders, files, now);
  let changed = folders.moves.length > 0 || folders.added.length > 0;

  // A listing without any file or collection folder is not trusted to remove anything:
  // the default collection's folder always exists, so the vault is not listed yet.
  const owned = indexedPaths(metadata);
  const relinked = files.size > 0 ? relinkAssets(metadata, files, deleted, owned, ops, listing.recorded) : { changed: false, fileMoves: [] };
  changed = relinked.changed || changed;
  if (collectionFolders.size > 0) changed = forgetCollectionsWithoutFolder(metadata, collectionFolders, now) || changed;
  changed = dropShadowedRecoveries(metadata) || changed;
  changed = tidyRecoveredTokens(metadata, now) || changed;
  changed = adoptUnindexedFiles(metadata, files, listing.json, owned, now) || changed;
  changed = adoptTokenArtwork(metadata, files, owned, now) || changed;
  changed = ensureCollectionRecords(metadata) || changed;

  return {
    changed,
    folderMoves: folders.moves,
    fileMoves: relinked.fileMoves,
    ops,
    missingFolders: Object.keys(metadata.collections).filter((id) => !collectionFolders.has(id)),
  };
}
