import { getDomHost } from '../../../host/dom';
import { openVideoElement } from './videoElement';

/**
 * The poster of an animated map: its first frame, at the video's own size. Everything that reads a
 * map's pixels reads it (tiles, overview, thumbnails, grid detection, the lighting's bounce), never
 * the playing video. `bytes` stay usable: the video is made of a copy.
 */
export async function videoPoster(bytes: BlobPart, mime: string): Promise<ImageBitmap> {
  const video = await openVideoElement(getDomHost().activeDocument(), bytes, mime);
  try {
    return await createImageBitmap(video.element);
  } finally {
    video.release();
  }
}

/** The poster as a PNG, for what takes an image file (thumbnails). */
export async function videoPosterBlob(bytes: BlobPart, mime: string): Promise<Blob> {
  const poster = await videoPoster(bytes, mime);
  try {
    const canvas = new OffscreenCanvas(poster.width, poster.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The video poster could not be drawn.');
    context.drawImage(poster, 0, 0);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    poster.close();
  }
}
