import type { DerivedFormat } from '../../imageProcessing/imageEncoder';
import { TESSERA_SPEC } from './pyramid';

/**
 * What the cache records of a pyramid, and the recipe its tesserae were made by: `TESSERA_SPEC`,
 * `TESSERA_BUILD` and their encoding. A pyramid of another recipe is rebuilt, never read.
 */

/**
 * How this device builds tesserae, beside `TESSERA_SPEC` (their geometry, which the players' page
 * checks too, so raising that breaks online play across versions). Raising this rebuilds every
 * cached pyramid on this device alone. 1: photos turned by EXIF are decoded without their quarter
 * turn (the coarse levels cached of them before were squeezed).
 */
export const TESSERA_BUILD = 1;

export interface PyramidManifest {
  hash: string;
  spec: number;
  /** `TESSERA_BUILD` when it was built; absent in manifests written before it existed. */
  build?: number;
  /**
   * The format of its tesserae where that is not WebP: `png` on a platform that cannot encode WebP.
   * Absent for WebP, so the manifests of every device that encodes it stay as they were.
   */
  encoding?: 'png';
  width: number;
  height: number;
  decodedScale: number;
  complete: boolean;
  bytes: number;
  lastUsed: number;
}

/** What a manifest records for tesserae of `format`: nothing for WebP. */
export function manifestEncoding(format: DerivedFormat): Pick<PyramidManifest, 'encoding'> {
  return format === 'webp' ? {} : { encoding: format };
}

/** The recipe of a pyramid whose tesserae are of `format`, as one string: `2.1` for WebP, `2.1.png` for PNG. */
export function tesseraRecipe(format: DerivedFormat): string {
  return [TESSERA_SPEC, TESSERA_BUILD, ...Object.values(manifestEncoding(format))].join('.');
}

/** The recipe `manifest` was built by, as `tesseraRecipe` writes it. */
function recipeOf(manifest: PyramidManifest): string {
  return [manifest.spec, manifest.build, ...(manifest.encoding ? [manifest.encoding] : [])].join('.');
}

/** Whether the pyramid was built as this version builds them, with tesserae of the `format` this device encodes. */
export function isCurrentManifest(manifest: PyramidManifest, format: DerivedFormat): boolean {
  return recipeOf(manifest) === tesseraRecipe(format);
}

/** The manifest of a pyramid about to be built from `source` with tesserae of `format`. */
export function freshManifest(source: Pick<PyramidManifest, 'hash' | 'width' | 'height' | 'decodedScale'>, format: DerivedFormat, now: number): PyramidManifest {
  return { ...source, spec: TESSERA_SPEC, build: TESSERA_BUILD, ...manifestEncoding(format), complete: false, bytes: 0, lastUsed: now };
}
