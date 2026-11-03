import type { App } from 'obsidian';
import { ensureFolder } from '../../plugin/vaultFolders';
import { isRecord } from '../../utils/guards';
import { discardAssetFiles, writeAssetImage } from '../assetImageFiles';
import { collectionFolderPath } from '../assetPaths';
import type { AssetService } from '../AssetService';
import { fetchStatblock, fetchStatblockManifest, writeStatblock, type StatblockSet } from './starterStatblocks';
import { fetchBytes, fetchVerified, StockPackError, type FetchBytes, type PackedFile } from './verifiedFetch';

/**
 * Creature tokens cut from Oozejar's Illustrated Bestiary (CC BY-SA 4.0) and class tokens drawn from
 * Sketch Studio's icons (CC BY 4.0), each with its tags, as `credits.md` on the host says. A pack is
 * never changed in place: a new one is a new folder and a new manifest hash.
 */
const HOST = 'https://assets.atlas-vtt.dev/starter/bestiary-2/';
const MANIFEST: PackedFile = { key: 'manifest.json', bytes: 30_131, sha256: 'd0ad97a1ad37057780aa85f1597a12ad0cfa3048032cf14d8209ae0083c97666' };

export const BESTIARY_TOKEN_COUNT = 155;
/** What the download comes to, for the offer to say. */
export const BESTIARY_BYTES = 18_594_106;
const CREDITS_NOTE = 'Starter token credits.md';
/** What a manifest's tag may be: the asset manager's tags are short names. */
const MAX_TAG_LENGTH = 48;
const MAX_TAGS = 4;
/** With the collection's uid, the same id on every device, so two devices downloading into one collection before they sync hold one set. */
const ID_PREFIX = 'token-bestiary-';
/** Requests at a time. */
const PARALLEL = 6;

interface BestiaryToken extends PackedFile {
  name: string;
  tags: string[];
}

interface Manifest {
  credits: PackedFile;
  tokens: BestiaryToken[];
}

function packedFile(value: unknown, extension: string): PackedFile {
  if (!isRecord(value)) throw new StockPackError('The manifest names a file it does not describe.');
  const { key, bytes, sha256 } = value;
  if (typeof key !== 'string' || !new RegExp(`^[a-z0-9-]+\\.${extension}$`).test(key) || typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0 || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw new StockPackError('The manifest names a file it does not describe.');
  }
  return { key, bytes, sha256 };
}

function tagsOf(value: unknown): string[] {
  const valid = Array.isArray(value) && value.length <= MAX_TAGS && value.every((tag) => typeof tag === 'string' && tag.trim() !== '' && tag.length <= MAX_TAG_LENGTH);
  if (!valid) throw new StockPackError('The manifest gives a token tags it cannot have.');
  return value.map((tag: string) => tag.trim());
}

/** The manifest's hash is pinned above, so this only turns its JSON into types. */
function readManifest(bytes: ArrayBuffer): Manifest {
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(data) || data.format !== 2 || !Array.isArray(data.tokens)) throw new StockPackError('The manifest is of another format.');
  const tokens = data.tokens.map((entry: unknown): BestiaryToken => {
    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name.trim() === '') throw new StockPackError('The manifest names a token without a name.');
    return { ...packedFile(entry, 'webp'), name: entry.name, tags: tagsOf(entry.tags) };
  });
  return { credits: packedFile(data.credits, 'md'), tokens };
}

/** A token's key without its extension, as the statblocks' manifest names it. */
const tokenKeyOf = (token: BestiaryToken): string => token.key.replace(/\.webp$/, '');

const tokenIdOf = (collectionUid: string, token: BestiaryToken): string => `${ID_PREFIX}${collectionUid}-${tokenKeyOf(token)}`;

/** Whether a collection holds any of the pack's tokens. A user who deleted some kept the rest on purpose. */
export async function hasBestiaryTokens(assets: AssetService, collection: string): Promise<boolean> {
  return (await assets.getAssets(collection, 'token')).some((token) => token.id.startsWith(ID_PREFIX));
}

/** Runs `task` for every item, at most `PARALLEL` at a time, and returns the results in the items' order. */
async function inPool<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) {
      const item = items[index];
      if (item !== undefined) results[index] = await task(item);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return results;
}

export interface InstallOptions {
  /** Hears the share of the pack's bytes fetched so far. */
  onStep?: (share: number) => void;
  fetch?: FetchBytes;
  /** The manifest the pack must have; the pinned one outside tests. */
  manifest?: PackedFile;
  /** The statblocks the tokens come with, linked to them; none without. */
  statblocks?: StatblockSet;
  /** The statblocks' manifest; the set's pinned one outside tests. */
  statblockManifest?: PackedFile;
}

/**
 * Fetches the whole pack and checks every file before anything is written, then adds the tokens
 * to `collection` with the tags the manifest gives them, each with its statblock from the chosen
 * set where the set has one, and a note that credits the art. Tokens already in it are left alone.
 * Returns how many tokens were added.
 */
export async function installBestiaryTokens(app: App, assets: AssetService, collection: string, options: InstallOptions = {}): Promise<number> {
  const { onStep, fetch = fetchBytes, manifest: pinned = MANIFEST, statblocks: set } = options;
  onStep?.(0);
  const manifest = readManifest(await fetchVerified(HOST, pinned, fetch));
  const entries = set ? await fetchStatblockManifest(set, fetch, options.statblockManifest) : [];
  const files: PackedFile[] = [manifest.credits, ...manifest.tokens];
  const total = [...files, ...entries].reduce((sum, file) => sum + file.bytes, 0);
  let done = 0;
  const counted = <R>(file: PackedFile, result: R): R => {
    done += file.bytes;
    onStep?.(done / total);
    return result;
  };
  const [credits, ...images] = await inPool(files, async (file) => counted(file, await fetchVerified(HOST, file, fetch)));
  const fetchedStatblocks = set ? await inPool(entries, async (entry) => counted(entry, await fetchStatblock(set, entry, fetch))) : [];
  const statblockOf = new Map(entries.map((entry, index) => [entry.token, fetchedStatblocks[index]]));

  const added = await assets.runExclusive(async () => {
    const target = await assets.getCollection(collection);
    if (!target) throw new StockPackError(`There is no collection ${collection}.`);
    const present = new Set((await assets.getTokenAssets()).map((token) => token.id));
    const fresh = manifest.tokens.flatMap((token, index) => {
      const bytes = images[index];
      const id = tokenIdOf(target.uid, token);
      return present.has(id) || !bytes ? [] : [{ token, bytes, id }];
    });
    if (fresh.length === 0) return 0;
    // The collection's own spelling of a tag it has already, else the pack's.
    const tagNames = new Map<string, string>();
    for (const name of new Set(fresh.flatMap(({ token }) => token.tags))) tagNames.set(name, (await assets.createTag(collection, 'tokens', name)).name);
    const written: string[] = [];
    try {
      const records = [];
      for (const { token, bytes, id } of fresh) {
        const imagePath = await writeAssetImage(app, token.name, bytes);
        written.push(imagePath);
        const statblock = statblockOf.get(tokenKeyOf(token));
        const note = statblock ? await writeStatblock(app, collection, statblock, imagePath) : null;
        if (note) written.push(note.path);
        records.push({
          id, name: token.name, imagePath, collection, tags: token.tags.map((tag) => tagNames.get(tag) ?? tag), showRing: true,
          ...(note && { statblockPath: note.path }), ...(note?.size !== undefined && { size: note.size }),
        });
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
