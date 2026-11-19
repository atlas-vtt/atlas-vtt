import type { App } from 'obsidian';
import { t } from '../../i18n';
import { isRecord } from '../../utils/guards';
import type { AssetService } from '../AssetService';
import type { BundleProgressListener } from '../collectionBundle/bundleProgress';
import { readBundleArchive } from '../collectionBundle/bundleReader';
import { openCollectionImport, type ImportSession } from '../collectionBundle/collectionImport';
import { isItemManifest } from './itemBundleFormat';
import { checkedItemBundle } from './itemBundleReader';
import { openItemImport, type ItemImportOptions, type ItemImportSession } from './itemImport';

/** The listing uid a manifest names: an item's, or a collection's; null where it names none. */
function listingUidOf(manifest: unknown): string | null {
  const owner = isItemManifest(manifest) ? manifest.item : isRecord(manifest) ? manifest.collection : undefined;
  return isRecord(owner) && typeof owner.uid === 'string' ? owner.uid : null;
}

/** The import of a bundle under review: a collection's, or a single item's. */
export type BundleImport =
  | { kind: 'collection'; session: ImportSession }
  | { kind: 'item'; session: ItemImportSession };

/**
 * Reads a bundle once and opens the import its manifest asks for: the item review for an item
 * bundle, the collection review for anything else. Nothing is written until the session applies.
 */
export async function openBundleImport(
  app: App,
  assets: AssetService,
  data: Blob,
  onProgress: BundleProgressListener = () => undefined,
  options: ItemImportOptions = {},
): Promise<BundleImport> {
  const archive = await readBundleArchive(data, onProgress);
  if (options.listingUid !== undefined && listingUidOf(archive.manifest) !== options.listingUid) throw new Error(t('armarium.otherListing'));
  if (isItemManifest(archive.manifest)) {
    const bundle = await checkedItemBundle(archive, onProgress);
    return { kind: 'item', session: await openItemImport(app, bundle, options) };
  }
  return { kind: 'collection', session: await openCollectionImport(app, assets, archive, onProgress) };
}
