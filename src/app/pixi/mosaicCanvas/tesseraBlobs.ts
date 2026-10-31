import { pyramidOf, tesseraKey, type Pyramid, type TesseraRef } from './pyramid';
import type { PyramidManifest, TesseraStore } from './tesseraStore';

/** A tessera and its stored WebP size in bytes. */
export interface StoredTesseraSize extends TesseraRef {
  bytes: number;
}

/** Which tesserae a `tessera-blobs` request names: a list, or every tessera of a level. */
export type TesseraSelection = TesseraRef[] | { level: number };

/** Every tessera of a pyramid, in its order: level by level, row by row. */
export function pyramidTesserae(pyramid: Pyramid): TesseraRef[] {
  const refs: TesseraRef[] = [];
  for (const level of pyramid.levels) {
    for (let row = 0; row < level.rows; row++) for (let col = 0; col < level.cols; col++) refs.push({ level: level.index, col, row });
  }
  return refs;
}

/** The pyramid a stored manifest names. */
export const manifestPyramid = (manifest: Pick<PyramidManifest, 'width' | 'height' | 'decodedScale'>): Pyramid => pyramidOf(manifest.width, manifest.height, manifest.decodedScale);

/** The tesserae a selection names, checked against the pyramid; throws for one outside it. */
export function selectedTesserae(pyramid: Pyramid, selection: TesseraSelection): TesseraRef[] {
  if (Array.isArray(selection)) return selection;
  const level = pyramid.levels[selection.level];
  if (!level) throw new RangeError(`Level ${selection.level} is outside the pyramid`);
  return pyramidTesserae(pyramid).filter((ref) => ref.level === level.index);
}

/** The stored bytes of the tesserae a selection names, as they are (WebP), in its order; null for one the cache misses. */
export async function readTesseraBlobs(store: TesseraStore, hash: string, selection: TesseraSelection): Promise<(ArrayBuffer | null)[]> {
  const manifest = await store.readManifest(hash);
  if (!manifest) return Array.isArray(selection) ? selection.map(() => null) : [];
  const refs = selectedTesserae(manifestPyramid(manifest), selection);
  return Promise.all(refs.map(async (ref) => (await store.getTessera(hash, ref))?.arrayBuffer() ?? null));
}

/**
 * A level of a cached pyramid whose every tessera is stored: the size and decoded scale of the pyramid
 * it belongs to (its manifest's), the level, and each of its tesserae' stored bytes in the pyramid's order.
 */
export interface StoredLevel {
  width: number;
  height: number;
  decodedScale: number;
  level: number;
  tesserae: StoredTesseraSize[];
}

/**
 * The level of a pyramid once the cache holds all its tesserae, read without decoding; null while it
 * holds none of the pyramid or misses a tessera of the level. Throws for a level outside the pyramid.
 */
export async function readStoredLevel(store: TesseraStore, hash: string, level: number): Promise<StoredLevel | null> {
  const manifest = await store.readManifest(hash);
  if (!manifest) return null;
  const refs = selectedTesserae(manifestPyramid(manifest), { level });
  const held = await store.existingTesserae(hash);
  if (refs.some((ref) => !held.has(tesseraKey(ref)))) return null;
  const tesserae: StoredTesseraSize[] = [];
  for (const ref of refs) {
    const blob = await store.getTessera(hash, ref);
    if (!blob) return null;
    tesserae.push({ ...ref, bytes: blob.size });
  }
  return { width: manifest.width, height: manifest.height, decodedScale: manifest.decodedScale, level, tesserae };
}
