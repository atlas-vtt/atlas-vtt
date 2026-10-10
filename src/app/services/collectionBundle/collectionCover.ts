import { TFile, type App } from 'obsidian';
import { COLLECTIONS_DIR, type Asset, type CollectionMetadata } from '../AssetService';
import { isPersistedMapEnvelope } from '../MapPersistence';
import { readVaultBinary } from '../../utils/hiddenVaultFiles';
import { optimizeImage } from '../../imageProcessing/imageProcessing';
import { baseName } from '../../utils/pathUtils';
import { sceneThumbnailPath } from './collectionReferences';
import { asNamedWebp } from './webpNamedFiles';

/** Artwork of a map or scene that the collection's cover can be made from. */
export interface CoverCandidate {
  key: string;
  name: string;
  /** Vault path of the image the cover is made from. */
  sourcePath: string;
  /** Resource URL of the full image, for the large preview. */
  imageUrl: string;
  /** Resource URL of a small version, for the picker. */
  previewUrl: string;
}

/** The collection's cover as the vault has it now. */
export interface CurrentCover {
  path: string;
  url: string;
}

/** The cover an export carries: the collection's current one, a map's or scene's artwork, an uploaded image, or none. */
export type CoverChoice =
  | { kind: 'current' }
  | { kind: 'artwork'; path: string }
  | { kind: 'upload'; image: Blob }
  | { kind: 'none' };

/** A cover file ready to pack; `isNew` when the vault has yet to store it at `path`. */
export interface CoverFile {
  path: string;
  data: ArrayBuffer;
  isNew: boolean;
}

export const collectionCoverPath = (collectionId: string): string => `${COLLECTIONS_DIR}/${collectionId}/cover.webp`;

/** Covers fill the dialog's banner; this keeps them sharp on high-density screens without bloating the bundle. */
const COVER_MAX_SIZE = 1600;
const IMAGE_FILE = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

function imageUrl(app: App, path: string | undefined): string | null {
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  return file instanceof TFile && IMAGE_FILE.test(file.path) ? app.vault.getResourcePath(file) : null;
}

export function currentCover(app: App, collection: CollectionMetadata): CurrentCover | undefined {
  const url = imageUrl(app, collection.coverPath);
  return url && collection.coverPath ? { path: collection.coverPath, url } : undefined;
}

/** The background image a scene's map file shows, if it can be read. */
async function sceneBackground(app: App, mapPath: string): Promise<string | undefined> {
  const file = app.vault.getAbstractFileByPath(mapPath);
  if (!(file instanceof TFile)) return undefined;
  try {
    const envelope: unknown = JSON.parse(await app.vault.cachedRead(file));
    return isPersistedMapEnvelope(envelope) ? envelope.state?.background ?? undefined : undefined;
  } catch {
    return undefined;
  }
}

/** The artwork of maps and then scenes that can become the cover, each image once. */
export async function coverCandidates(app: App, assets: readonly Asset[]): Promise<CoverCandidate[]> {
  const candidates = new Map<string, CoverCandidate>();
  const add = (key: string, name: string, sourcePath: string | undefined, previewPath: string | undefined): void => {
    const imageUrlOf = sourcePath ? imageUrl(app, sourcePath) : null;
    if (!sourcePath || !imageUrlOf || candidates.has(sourcePath)) return;
    candidates.set(sourcePath, { key, name, sourcePath, imageUrl: imageUrlOf, previewUrl: imageUrl(app, previewPath) ?? imageUrlOf });
  };
  for (const asset of assets) {
    if (asset.type === 'map') add(asset.id, asset.name, asset.mapFilePath, asset.thumbnailPath);
  }
  for (const asset of assets) {
    const mapPath = asset.type === 'scene' ? asset.data?.mapPath : undefined;
    if (!mapPath) continue;
    const thumbnail = sceneThumbnailPath(mapPath);
    add(asset.id, asset.name, await sceneBackground(app, mapPath) ?? thumbnail, thumbnail);
  }
  return [...candidates.values()];
}

/** `image` scaled to fit the cover size, as the WebP the cover's name says. */
async function renderCover(image: Blob): Promise<ArrayBuffer> {
  const { image: cover } = await optimizeImage(image, { maxWidth: COVER_MAX_SIZE, maxHeight: COVER_MAX_SIZE, quality: 0.85 }, { webpOnly: true });
  return cover.arrayBuffer();
}

/** The cover file an export of `collection` carries for `choice`, or null for none. */
export async function coverFileFor(app: App, collection: CollectionMetadata, choice: CoverChoice): Promise<CoverFile | null> {
  switch (choice.kind) {
    case 'none':
      return null;
    case 'current': {
      const path = collection.coverPath;
      const data = path ? await readVaultBinary(app, path) : null;
      if (!path || !data) return null;
      const webp = await asNamedWebp(path, data, renderCover);
      return webp ? { path, data: webp, isNew: true } : { path, data, isNew: false };
    }
    case 'artwork': {
      const source = await readVaultBinary(app, choice.path);
      if (!source) throw new Error(`The cover image ${baseName(choice.path)} is missing.`);
      return { path: collectionCoverPath(collection.id), data: await renderCover(new Blob([source])), isNew: true };
    }
    case 'upload':
      return { path: collectionCoverPath(collection.id), data: await renderCover(choice.image), isNew: true };
  }
}

/** Writes a newly made cover into the collection's folder, over the cover it replaces. */
export async function storeCover(app: App, cover: CoverFile): Promise<void> {
  if (!cover.isNew) return;
  const existing = app.vault.getAbstractFileByPath(cover.path);
  if (existing instanceof TFile) await app.vault.modifyBinary(existing, cover.data);
  else await app.vault.createBinary(cover.path, cover.data);
}
