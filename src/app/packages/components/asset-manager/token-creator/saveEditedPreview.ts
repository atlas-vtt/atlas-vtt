import { Notice, type App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import type { AssetThumbnailService } from '../../../../services/AssetThumbnailService';
import { writeAssetImage } from '../../../../services/assetImageFiles';
import { transferAssets } from '../../../../services/assetTransfer/assetTransfer';
import type { ProcessedImage } from '../../../../imageProcessing/imageProcessing';
import { prebuildMapImageAt } from '../../../../pixi/mapImage/prebuildMapImage';
import { STORED_IMAGE_SCALE } from './cropMath';
import { prepareSaveImage, type SaveImageContext } from './prepareSaveImages';
import { overwriteStoredImage, storedImageFile } from './storedTokenImage';
import type { EditTokenInput, TokenPreview } from './types';
import { t } from '../../../../i18n';

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
 * An edit without an upload crops the token's stored image when the crop was moved or
 * the ring was just turned on (the stored image is then the whole artwork).
 */
function cropsStoredImage(preview: TokenPreview, editToken: EditTokenInput): boolean {
  if (preview.file || preview.showRing === false) return false;
  const { imageScale, imagePosition } = preview;
  return editToken.showRing === false || imageScale !== STORED_IMAGE_SCALE || imagePosition.x !== 0 || imagePosition.y !== 0;
}

/**
 * Updates the edited asset from its single preview, writing a new image only when one was
 * uploaded or the crop changed. Returns the number of assets saved (0 or 1).
 */
export async function saveEditedPreview(save: EditedPreviewSave): Promise<number> {
  const { app, assetService, thumbnails, editToken, preview, tags, collectionId, mode } = save;
  let imagePath = editToken.imagePath ?? editToken.imageUrl;
  let thumbnailPath: string | undefined;
  const source = preview.file ?? (cropsStoredImage(preview, editToken) ? await storedImageFile(app, editToken) : null);
  if (source) {
    let prepared: ProcessedImage;
    try {
      prepared = await prepareSaveImage(source, preview, save);
    } catch (error) {
      console.error(`[TokenCreator] Failed to optimize ${preview.name}:`, error);
      new Notice(t(`creator.${mode}.optimizeFailed`, { name: preview.name }));
      return 0;
    }
    const data = await prepared.image.arrayBuffer();
    imagePath = await overwriteStoredImage(app, editToken.imagePath, data) ?? await writeAssetImage(app, preview.name, data);
    thumbnailPath = await thumbnails.tryThumbnailForImage(imagePath, prepared.thumbnail);
    if (mode === 'map') prebuildMapImageAt(app, imagePath);
  }
  const before = await assetService.getAssetById(editToken.id);
  const previousThumbnail = before?.type === 'token' || before?.type === 'map' ? before.thumbnailPath : undefined;
  await assetService.updateAsset(editToken.id, {
    name: preview.name, imagePath, showRing: preview.showRing !== false, size: preview.size, tags: preview.tags ?? tags,
    ...(source && { thumbnailPath }),
  });
  // A new image path (an upload, or stored art renamed to .webp) gets a thumbnail of its own
  if (source && previousThumbnail && previousThumbnail !== thumbnailPath) await thumbnails.tryDiscard(previousThumbnail);
  const stored = await assetService.getAssetById(editToken.id);
  if (stored && stored.collection !== collectionId) {
    await transferAssets(app, assetService, { assetIds: [editToken.id], targetCollectionId: collectionId, mode: 'move' });
  }
  return 1;
}
