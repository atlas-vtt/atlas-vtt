// Frozen from 29c9495a src/app/services/AssetThumbnailService.ts:37-45 and :86-90 (module-private function and a method there), exported for the comparison.
import { THUMBNAIL_DIR } from '../../../src/app/services/AssetThumbnailService';

/** Short stable digest so thumbnails of same-named images in different folders do not collide. */
export function pathDigest(path: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Vault path of the thumbnail that belongs to `imagePath`, whether or not it exists yet. */
export function thumbnailPathFor(imagePath: string): string {
    const fileName = imagePath.slice(imagePath.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    const safeName = fileName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'token';
    return `${THUMBNAIL_DIR}/${safeName}-${pathDigest(imagePath)}.webp`;
}
