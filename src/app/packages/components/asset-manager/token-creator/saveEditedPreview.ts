import { type App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { AssetThumbnailService } from '../../../../services/AssetThumbnailService';
import { discardAssetFiles, writeAssetImage } from '../../../../services/assetImageFiles';
import { defaultImageSource, writeTokenImageSource } from '../../../../services/tokenImageSources';
import type { TokenImageSource } from '../../../../types/tokenImageSource';
import { transferAssets } from '../../../../services/assetTransfer/assetTransfer';
import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import { prebuildMapImageAt } from '../../../../pixi/mapImage/prebuildMapImage';
import { cropReset } from './cropMath';
import { prepareSaveImage, type SaveImageContext } from './prepareSaveImages';
import { overwriteStoredImage, storedImageFile } from './storedTokenImage';
import type { EditTokenInput, TokenPreview } from './types';
import { t } from '../../../../i18n';
import { showNotice } from '../../../../ui/notice';
import { imageSourceFor, sameCrop } from './tokenFraming';

export interface EditedPreviewSave extends SaveImageContext {
  app: App;
  assetService: AssetService;
  thumbnails: AssetThumbnailService;
  editToken: EditTokenInput;
  preview: TokenPreview;
  tags: string[];
  collectionId: string;
}

/**
 * A preserved source is rendered again when framing or ring mode changes.
 * Legacy artwork only needs rendering when its existing fit was adjusted.
 */
function cropsStoredImage(preview: TokenPreview, editToken: EditTokenInput, source: TokenImageSource | undefined): boolean {
  if (preview.file) return false;
  if (source) {
    const saved = editToken.showRing === false ? source.unframed : source.framed;
    return (preview.showRing !== false) !== (editToken.showRing !== false) || !sameCrop(preview, saved);
  }
  const { imageScale, imagePosition } = preview;
  const initial = cropReset(preview);
  return (preview.showRing !== false && editToken.showRing === false) || imageScale !== initial.imageScale || imagePosition.x !== 0 || imagePosition.y !== 0;
}

/**
 * Updates the edited asset from its single preview, writing a new image only when one was
 * uploaded or the crop changed. Returns the number of assets saved (0 or 1).
 */
export async function saveEditedPreview(save: EditedPreviewSave): Promise<number> {
  const { app, assetService, thumbnails, editToken, preview, tags, collectionId, mode } = save;
  const before = await assetService.getAssetById(editToken.id);
  const previousSource = before?.type === 'token' ? before.imageSource : undefined;
  let imageSource = previousSource;
  let imagePath = editToken.imagePath ?? editToken.imageUrl;
  let thumbnailPath: string | undefined;
  const source = preview.file ?? (cropsStoredImage(preview, editToken, previousSource)
    ? await storedImageFile(app, { ...editToken, imagePath: previousSource?.path ?? editToken.imagePath }) : null);
  if (source) {
    let prepared: ProcessedImage;
    try {
      prepared = await prepareSaveImage(source, preview, save);
    } catch (error) {
      console.error(`[TokenCreator] Failed to optimize ${preview.name}:`, error);
      showNotice(t(`creator.${mode}.optimizeFailed`, { name: preview.name }));
      return 0;
    }
    if (mode === 'token' && (preview.file || !previousSource)) {
      const path = await writeTokenImageSource(app, source);
      imageSource = imageSourceFor(preview, path);
      if (!previousSource) {
        // Link the backup before overwriting legacy art. Even an interrupted save retains its pixels.
        await assetService.updateAsset(editToken.id, { imageSource: defaultImageSource(path, cropReset({ file: null }).imageScale) });
      }
    }
    const data = await prepared.image.arrayBuffer();
    imagePath = await overwriteStoredImage(app, editToken.imagePath, data) ?? await writeAssetImage(app, preview.name, data);
    thumbnailPath = await thumbnails.tryThumbnailForImage(imagePath, prepared.thumbnail);
    if (mode === 'map') prebuildMapImageAt(app, imagePath);
  }
  const previousThumbnail = before?.type === 'token' || before?.type === 'map' ? before.thumbnailPath : undefined;
  await assetService.updateAsset(editToken.id, {
    name: preview.name, imagePath, showRing: preview.showRing !== false, size: preview.size, tags: preview.tags ?? tags,
    ...(source && { thumbnailPath }),
    ...(mode === 'token' && imageSource && { imageSource: imageSourceFor(preview, imageSource.path) }),
  });
  if (previousSource && imageSource && previousSource.path !== imageSource.path) await discardAssetFiles(app, [previousSource.path]);
  // A new image path (an upload, or stored art renamed to .webp) gets a thumbnail of its own
  if (source && previousThumbnail && previousThumbnail !== thumbnailPath) await thumbnails.tryDiscard(previousThumbnail);
  const stored = await assetService.getAssetById(editToken.id);
  if (stored && stored.collection !== collectionId) {
    await transferAssets(app, assetService, { assetIds: [editToken.id], targetCollectionId: collectionId, mode: 'move' });
  }
  return 1;
}
