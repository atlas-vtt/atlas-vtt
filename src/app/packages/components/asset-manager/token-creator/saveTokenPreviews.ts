import { App, Notice, TFile } from 'obsidian';
import { AssetRegistrationUncertainError } from '../../../../services/assetRegistrationRecovery';
import { withStatblockImportLock } from '../../../../services/statblockImportLock';
import { requireResolvedBestiary, statblockImportCandidate, statblockLookup, type StatblockLookup } from '../../../../services/statblockImportCandidates';
import { AssetService, type NewAsset } from '../../../../services/AssetService';
import { AssetThumbnailService } from '../../../../services/AssetThumbnailService';
import { t } from '../../../../i18n';
import { discardAssetFiles, writeAssetImage } from '../../../../services/assetImageFiles';
import { prepareSaveImages, type SaveImageContext } from './prepareSaveImages';
import { saveEditedPreview } from './saveEditedPreview';
import type { EditTokenInput, TokenPreview } from './types';
import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import { prebuildMapImageAt } from '../../../../pixi/mapImage/prebuildMapImage';

export interface SaveTokenPreviewsOptions extends SaveImageContext {
  app: App;
  assetService: AssetService;
  previews: TokenPreview[];
  collection: string;
  tags: string[];
  editToken?: EditTokenInput | null;
  /** Called with every batch of previews once their assets are registered. */
  onSaved?: (ids: string[]) => void;
  /** Called once per preview as it is saved or fails, with the count so far and the number being saved. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Previews registered with one save of the asset index (see `AssetService.addAssets`); 6,000 tokens saved one by one wrote about 20 GB. */
const REGISTER_BATCH = 100;

/** A preview whose files are written, waiting for its batch to be registered. */
interface WrittenPreview {
  id: string;
  asset: NewAsset;
  /** What to trash if the batch cannot be registered: a token's image and thumbnail, a map's thumbnail. */
  discard: (string | undefined)[];
}

/** Throws when a queued statblock note no longer resolves to an importable creature. */
async function checkStatblock(app: App, preview: TokenPreview, lookup: StatblockLookup | null): Promise<void> {
  if (!preview.statblockPath || !lookup) return;
  const note = app.vault.getAbstractFileByPath(preview.statblockPath);
  if (!(note instanceof TFile)) throw new Error('The statblock note no longer exists.');
  const candidate = await statblockImportCandidate(app, note, lookup);
  if (!candidate || candidate.status !== 'ready') throw new Error(candidate?.detail ?? 'The statblock no longer resolves.');
}

/**
 * Persists every preview as an asset. In edit mode the single preview updates
 * the existing asset and replaces its image when one was uploaded or the crop changed.
 * Returns the number of previews that were saved.
 */
export async function saveTokenPreviews(options: SaveTokenPreviewsOptions): Promise<number> {
  return options.previews.some(p => p.statblockPath)
    ? withStatblockImportLock(options.app, () => savePreviews(options))
    : savePreviews(options);
}

async function savePreviews(options: SaveTokenPreviewsOptions): Promise<number> {
  const { app, assetService, mode, previews, collection, tags, editToken } = options;
  const destinations = await assetService.getCollections();
  const destination = destinations.find(c => c.id === collection) ?? destinations.find(c => c.name === collection);
  if (!destination) throw new Error('The destination collection no longer exists. Choose another collection.');
  const thumbnails = AssetThumbnailService.getInstance(app, assetService);
  const hasStatblocks = previews.some(p => p.statblockPath);
  if (hasStatblocks) await assetService.refreshMetadata();

  if (editToken) {
    const preview = previews[0];
    if (!preview) return 0;
    return saveEditedPreview({ ...options, thumbnails, editToken, preview, collectionId: destination.id });
  }

  // Built once: every preview of this save links a different note, so the tokens it adds never change another's check.
  const lookup = hasStatblocks ? statblockLookup(await assetService.getTokenAssets(), requireResolvedBestiary()) : null;
  const conversion = new AbortController();
  const stopConversion = (): void => conversion.abort();
  options.signal?.addEventListener('abort', stopConversion, { once: true });
  const prepared = prepareSaveImages(previews, options, conversion.signal);
  let saved = 0;
  let done = 0;

  const register = async (written: readonly WrittenPreview[]): Promise<void> => {
    if (written.length === 0) return;
    try {
      await assetService.addAssets(written.map(w => w.asset));
    } catch (error) {
      // An unconfirmed write may have committed; its files must stay.
      if (error instanceof AssetRegistrationUncertainError) throw error;
      await discardAssetFiles(app, written.flatMap(w => w.discard));
      new Notice(t(`creator.${mode}.saveFailedCount`, { count: written.length, error: error instanceof Error ? error.message : t('creator.indexWriteFailed') }));
      return;
    }
    saved += written.length;
    for (const { asset } of written) {
      if (asset.type === 'map') prebuildMapImageAt(app, asset.mapFilePath);
    }
    options.onSaved?.(written.map(w => w.id));
  };

  /** Writes a preview's files; a failure is reported and leaves nothing behind. */
  const write = async (preview: TokenPreview, pending: Promise<ProcessedImage>): Promise<WrittenPreview | null> => {
    let imagePath: string | undefined;
    let thumbnailPath: string | undefined;
    try {
      await checkStatblock(app, preview, lookup);
      const { image, thumbnail } = await pending;
      if (options.signal?.aborted) return null;
      imagePath = await writeAssetImage(app, preview.name, await image.arrayBuffer());
      thumbnailPath = await thumbnails.tryThumbnailForImage(imagePath, thumbnail);
      const metadata = { collection: destination.id, tags: preview.tags ?? tags, ...(thumbnailPath && { thumbnailPath }) };
      const asset: NewAsset = mode === 'map'
        ? { type: 'map', name: preview.name, mapFilePath: imagePath, ...metadata }
        : {
          type: 'token', showRing: preview.showRing !== false, name: preview.name, imagePath,
          ...(preview.size !== undefined && { size: preview.size }),
          ...(preview.statblockPath ? { statblockPath: preview.statblockPath } : {}), ...metadata,
        };
      return { id: preview.id, asset, discard: mode === 'token' ? [imagePath, thumbnailPath] : [thumbnailPath] };
    } catch (error) {
      await discardAssetFiles(app, mode === 'token' ? [imagePath, thumbnailPath] : [thumbnailPath]);
      new Notice(`${preview.name}: ${error instanceof Error ? error.message : t('creator.saveFailed')}`);
      return null;
    } finally {
      if (!options.signal?.aborted) options.onProgress?.(++done, prepared.size);
    }
  };

  options.onProgress?.(done, prepared.size);
  try {
    let batch: WrittenPreview[] = [];
    for (const preview of previews) {
      if (options.signal?.aborted) break;
      const pending = prepared.get(preview.id);
      if (!pending) continue;
      const written = await write(preview, pending);
      if (written) batch.push(written);
      if (batch.length >= REGISTER_BATCH) {
        await register(batch);
        batch = [];
      }
    }
    await register(batch);
  } finally {
    options.signal?.removeEventListener('abort', stopConversion);
    conversion.abort();
    if (saved) app.workspace.trigger('atlas-vtt:refresh-assets');
  }
  return saved;
}
