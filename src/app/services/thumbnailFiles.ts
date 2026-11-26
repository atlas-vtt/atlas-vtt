import { DERIVED_FORMATS } from '../imageProcessing/imageEncoder';

/**
 * `path` under each of the other extensions a thumbnail is stored under (`DERIVED_FORMATS`: WebP, or
 * PNG from a device that cannot encode WebP). One library is shared by devices of both kinds.
 */
export function siblingPaths(path: string): string[] {
  const dot = path.lastIndexOf('.');
  const extension = path.slice(dot + 1).toLowerCase();
  return DERIVED_FORMATS.filter((other) => other !== extension).map((other) => `${path.slice(0, dot)}.${other}`);
}

/**
 * Every file a thumbnail recorded at `path` may lie in: that one first, then the same thumbnail in the
 * other format, which a device of the other kind made. Whatever takes the thumbnail somewhere (the
 * trash, a bundle, another collection) takes them all, or one stays behind for good.
 */
export function thumbnailFiles(path: string | undefined): string[] {
  return path ? [path, ...siblingPaths(path)] : [];
}
