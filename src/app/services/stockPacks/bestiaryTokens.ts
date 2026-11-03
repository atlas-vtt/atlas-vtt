import type { App } from 'obsidian';
import { ensureFolder } from '../../plugin/vaultFolders';
import { discardAssetFiles, writeAssetImage } from '../assetImageFiles';
import { collectionFolderPath } from '../assetPaths';
import type { AssetService } from '../AssetService';
import { fetchBytes, fetchVerified, StockPackError, type FetchBytes, type PackedFile } from './verifiedFetch';

/**
 * Creature tokens cut from Oozejar's Illustrated Bestiary (CC BY-SA 4.0), as `credits.md` on the
 * host says. A pack is never changed in place: a new one is a new folder and a new manifest hash.
 */
const HOST = 'https://assets.atlas-vtt.dev/starter/bestiary-1/';
const MANIFEST: PackedFile = { key: 'manifest.json', bytes: 23_442, sha256: '872c85d7e0653fbf233e6316d280590e1ea0200e64d1f54202040501e9aba382' };

export const BESTIARY_TAG = 'Bestiary';
export const BESTIARY_TOKEN_COUNT = 145;
/** What the download comes to, for the offer to say. */
export const BESTIARY_BYTES = 18_420_734;
const CREDITS_NOTE = 'Bestiary token credits.md';
/** The same id on every device, so two devices downloading the pack before they sync hold one set. */
const ID_PREFIX = 'token-bestiary-';
/** Requests at a time. */
const PARALLEL = 6;

interface BestiaryToken extends PackedFile {
  name: string;
}

interface Manifest {
  credits: PackedFile;
  tokens: BestiaryToken[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function packedFile(value: unknown, extension: string): PackedFile {
  if (!isRecord(value)) throw new StockPackError('The manifest names a file it does not describe.');
  const { key, bytes, sha256 } = value;
  if (typeof key !== 'string' || !new RegExp(`^[a-z0-9-]+\\.${extension}$`).test(key) || typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0 || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new StockPackError('The manifest names a file it does not describe.');
  }
  return { key, bytes, sha256 };
}

/** The manifest's hash is pinned above, so this only turns its JSON into types. */
function readManifest(bytes: ArrayBuffer): Manifest {
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(data) || data.format !== 1 || !Array.isArray(data.tokens)) throw new StockPackError('The manifest is of another format.');
  const tokens = data.tokens.map((entry: unknown): BestiaryToken => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.trim() === '') throw new StockPackError('The manifest names a token without a name.');
    return { ...packedFile(entry, 'webp'), name: entry.name };
  });
  return { credits: packedFile(data.credits, 'md'), tokens };
}

const tokenIdOf = (token: BestiaryToken): string => `${ID_PREFIX}${token.key.replace(/\.webp$/, '')}`;

/** Whether the library holds any of the pack's tokens. A user who deleted some kept the rest on purpose. */
export async function hasBestiaryTokens(assets: AssetService): Promise<boolean> {
  return (await assets.getTokenAssets()).some((token) => token.id.startsWith(ID_PREFIX));
}

/** Fetches every file, at most `PARALLEL` at a time, in the order given. */
async function fetchAll(files: readonly PackedFile[], fetch: FetchBytes, onFetched: (file: PackedFile) => void): Promise<ArrayBuffer[]> {
  const fetched: ArrayBuffer[] = new Array<ArrayBuffer>(files.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < files.length; index = next++) {
      const file = files[index];
      if (!file) continue;
      fetched[index] = await fetchVerified(HOST, file, fetch);
      onFetched(file);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return fetched;
}

export interface InstallOptions {
  /** Hears the share of the pack's bytes fetched so far. */
  onStep?: (share: number) => void;
  fetch?: FetchBytes;
  /** The manifest the pack must have; the pinned one outside tests. */
  manifest?: PackedFile;
}

/**
 * Fetches the whole pack and checks every file before anything is written, then adds the tokens
 * to the default collection under the tag `BESTIARY_TAG`, with a note that credits the art. Tokens
 * already in the library are left alone. Returns how many tokens were added.
 */
export async function installBestiaryTokens(app: App, assets: AssetService, { onStep, fetch = fetchBytes, manifest: pinned = MANIFEST }: InstallOptions = {}): Promise<number> {
  onStep?.(0);
  const manifest = readManifest(await fetchVerified(HOST, pinned, fetch));
  const files: PackedFile[] = [manifest.credits, ...manifest.tokens];
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  let done = 0;
  const [credits, ...images] = await fetchAll(files, fetch, (file) => {
    done += file.bytes;
    onStep?.(done / total);
  });

  const added = await assets.runExclusive(async () => {
    const collection = assets.getDefaultCollectionId();
    const present = new Set((await assets.getTokenAssets()).map((token) => token.id));
    const fresh = manifest.tokens.flatMap((token, index) => {
      const bytes = images[index];
      return present.has(tokenIdOf(token)) || !bytes ? [] : [{ token, bytes }];
    });
    if (fresh.length === 0) return 0;
    const tag = await assets.createTag(collection, 'tokens', BESTIARY_TAG);
    const written: string[] = [];
    try {
      const records = [];
      for (const { token, bytes } of fresh) {
        const imagePath = await writeAssetImage(app, token.name, bytes);
        written.push(imagePath);
        records.push({ id: tokenIdOf(token), name: token.name, imagePath, collection, tags: [tag.name], showRing: true });
      }
      await assets.addTokenAssets(records);
    } catch (error) {
      await discardAssetFiles(app, written);
      throw error;
    }
    await writeCredits(app, assets, collection, credits);
    return fresh.length;
  });
  app.workspace.trigger('atlas-vtt:refresh-assets');
  return added;
}

/** The credit CC BY-SA asks for, as a note of the collection the tokens joined, unless one is there already. */
async function writeCredits(app: App, assets: AssetService, collection: string, credits: ArrayBuffer | undefined): Promise<void> {
  if (!credits) return;
  const folder = `${collectionFolderPath(collection)}/notes`;
  const notePath = `${folder}/${CREDITS_NOTE}`;
  if (app.vault.getAbstractFileByPath(notePath)) return;
  await ensureFolder(app, folder);
  await app.vault.create(notePath, new TextDecoder().decode(credits));
  await assets.addAsset({ type: 'note', name: CREDITS_NOTE.replace(/\.md$/, ''), notePath, collection, tags: [] });
}
