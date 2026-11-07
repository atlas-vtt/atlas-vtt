import { getLocale, t } from '../../i18n';
import { renderThumbnail, type ProcessedImage, type ThumbnailSpec } from '../../imageProcessing/imageProcessing';
import { MAX_VIDEO_MAP_BYTES, videoMimeType } from '../../pixi/mosaicCanvas/video/videoMapFiles';
import { videoPosterBlob } from '../../pixi/mosaicCanvas/video/videoPoster';
import { formatByteSize } from '../../utils/fileSize';

/** Why a video cannot become an animated map, in words for the player: its card shows them. */
export class VideoMapRefusedError extends Error {}

let lastPoster: Promise<unknown> = Promise.resolve();

/** Each first frame takes a video player of its own, of which a browser has few: a batch opens them one at a time. */
function oneAtATime<T>(run: () => Promise<T>): Promise<T> {
  const result = lastPoster.then(run, run);
  lastPoster = result.catch(() => undefined);
  return result;
}

async function posterOf(file: File, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  if (file.size > MAX_VIDEO_MAP_BYTES) throw new VideoMapRefusedError(t('videoMap.tooLarge', { size: formatByteSize(MAX_VIDEO_MAP_BYTES, getLocale()) }));
  try {
    return await videoPosterBlob(file, videoMimeType(file.name));
  } catch (error) {
    console.warn(`[Atlas] ${file.name} cannot be played as an animated map`, error);
    throw new VideoMapRefusedError(t('videoMap.unplayable'));
  }
}

/**
 * A video as the map creator takes it: the file itself, stored byte for byte (a browser cannot
 * encode video well, and players notice), once it played here, with a card and a thumbnail made of
 * its first frame. Without a thumbnail the background pass makes one later.
 */
export async function convertVideoMap(file: File, specs: { thumbnail: ThumbnailSpec; preview: ThumbnailSpec }, signal?: AbortSignal): Promise<ProcessedImage> {
  const poster = await oneAtATime(() => posterOf(file, signal));
  const small = (spec: ThumbnailSpec): Promise<Blob | null> => renderThumbnail(poster, spec, { ...(signal && { signal }) })
    .then((bytes) => new Blob([bytes], { type: 'image/webp' }))
    .catch((error: unknown) => {
      console.warn(`[Atlas] No small copy was made of ${file.name}`, error);
      return null;
    });
  const [preview, thumbnail] = await Promise.all([small(specs.preview), small(specs.thumbnail)]);
  return { image: file, thumbnail, preview: preview ?? poster, sourcePreview: null };
}
