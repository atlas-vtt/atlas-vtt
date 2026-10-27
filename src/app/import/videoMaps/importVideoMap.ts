import type { App } from 'obsidian';
import { getLocale, t } from '../../i18n';
import { prebuildMapImageAt } from '../../pixi/mapImage/prebuildMapImage';
import { isVideoMapPath, MAX_VIDEO_MAP_BYTES, videoMapExtension, videoMimeType } from '../../pixi/mapImage/video/videoMapFiles';
import type { AssetService } from '../../services/AssetService';
import type { AssetThumbnailService } from '../../services/AssetThumbnailService';
import { discardAssetFiles, writeAssetFile } from '../../services/assetImageFiles';
import { AssetRegistrationUncertainError } from '../../services/assetRegistrationRecovery';
import { describeError } from '../../utils/errors';
import { formatByteSize } from '../../utils/fileSize';
import { uvttSceneName } from '../uvtt/uvttFileNames';

export interface VideoMapImportDeps {
  app: App;
  assetService: Pick<AssetService, 'getCollection' | 'addAssets'>;
  thumbnails: Pick<AssetThumbnailService, 'tryThumbnailForImage'>;
  /** The video's first frame as an image file; rejects when the video cannot be played. */
  poster(bytes: ArrayBuffer, mime: string): Promise<Blob>;
  /** The card's thumbnail of a poster. */
  thumbnail(poster: Blob): Promise<Blob>;
}

export type VideoMapImport = { ok: true; name: string } | { ok: false; problem: string };

const refused = (problem: string): VideoMapImport => ({ ok: false, problem });

/** Why `file` cannot become an animated map by its name and size, or null when it may be tried. */
export function videoMapRefusal(file: Pick<File, 'name' | 'size'>): string | null {
  if (!isVideoMapPath(file.name)) return t('videoMap.notVideo');
  if (file.size > MAX_VIDEO_MAP_BYTES) return t('videoMap.tooLarge', { size: formatByteSize(MAX_VIDEO_MAP_BYTES, getLocale()) });
  return null;
}

/**
 * Adds a video to a collection as an animated map. The video is stored byte for byte (a browser
 * cannot encode video well, and players notice), only once it played here: its first frame is
 * the card's thumbnail and the map's tiles, built ahead like any new map's.
 */
export async function importVideoMap(deps: VideoMapImportDeps, file: File, collectionId: string): Promise<VideoMapImport> {
  const refusal = videoMapRefusal(file);
  if (refusal) return refused(refusal);
  const { app, assetService, thumbnails } = deps;
  if (!(await assetService.getCollection(collectionId))) return refused(t('videoMap.collectionGone'));

  const bytes = await file.arrayBuffer();
  let poster: Blob;
  try {
    poster = await deps.poster(bytes, videoMimeType(file.name));
  } catch (error) {
    console.warn(`[Atlas] ${file.name} cannot be played as an animated map`, error);
    return refused(t('videoMap.unplayable'));
  }

  const name = uvttSceneName(file.name);
  let mapFilePath: string | undefined;
  let thumbnailPath: string | undefined;
  try {
    mapFilePath = await writeAssetFile(app, name, bytes, videoMapExtension(file.name));
    const thumbnail = await deps.thumbnail(poster).catch((error: unknown) => {
      console.warn(`[Atlas] No thumbnail was made for ${file.name}`, error);
      return null;
    });
    // Without one, the background pass makes it later: reading the video again now would only wait.
    if (thumbnail) thumbnailPath = await thumbnails.tryThumbnailForImage(mapFilePath, thumbnail);
    await assetService.addAssets([{ type: 'map', name, mapFilePath, collection: collectionId, tags: [], ...(thumbnailPath && { thumbnailPath }) }]);
  } catch (error) {
    // An unconfirmed write may have committed; its files must stay.
    if (!(error instanceof AssetRegistrationUncertainError)) await discardAssetFiles(app, [mapFilePath, thumbnailPath]);
    return refused(t('videoMap.saveFailed', { reason: describeError(error) }));
  }
  prebuildMapImageAt(app, mapFilePath);
  return { ok: true, name };
}
