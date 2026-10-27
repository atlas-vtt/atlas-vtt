/**
 * Which files are animated maps: videos Chromium plays (WebM with VP8 or VP9, MP4 with H.264),
 * which an import keeps byte for byte.
 */

export const VIDEO_MAP_EXTENSIONS = ['webm', 'mp4', 'm4v'] as const;

/** What a file picker accepts to offer animated maps beside images. */
export const VIDEO_MAP_ACCEPT = VIDEO_MAP_EXTENSIONS.map((extension) => `.${extension}`).join(',');

/** Largest video an import takes: the whole file is read into memory to be played. */
export const MAX_VIDEO_MAP_BYTES = 500 * 1024 * 1024;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const slash = name.lastIndexOf('/');
  return dot > slash ? name.slice(dot + 1).toLowerCase() : '';
}

/** Whether a vault path or file name names an animated map by its extension. */
export function isVideoMapPath(name: string): boolean {
  return (VIDEO_MAP_EXTENSIONS as readonly string[]).includes(extensionOf(name));
}

/** The MIME type a video map is played as. */
export function videoMimeType(name: string): string {
  return extensionOf(name) === 'webm' ? 'video/webm' : 'video/mp4';
}

/** The extension a video map is stored under: its own, lower case. */
export function videoMapExtension(name: string): string {
  return extensionOf(name);
}
