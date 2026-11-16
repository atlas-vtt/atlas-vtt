import type { App } from 'obsidian';
import { ensureFolder, isPathTaken } from '../../plugin/vaultFolders';
import { tokenSizeFromCreatureSize } from '../../pixi/token-renderer/tokenSizing';
import { collectionFolderPath } from '../assetPaths';
import { freePathIn } from '../collectionBundle/pathRemap';
import { parseNoteYaml } from '../noteYaml';
import { isRecord } from '../../utils/guards';
import { fetchVerified, StockPackError, type FetchBytes, type PackedFile } from './verifiedFetch';

/**
 * Statblocks the starter tokens may come with, one set per game system whose licence lets Atlas
 * hand its monsters out: the 5E SRD 5.2.1 (CC BY 4.0) on the built-in 5E template, where a creature
 * the SRD lacks takes the statistics of one that fits its art under its own name, and the Cairn
 * bestiary (CC BY-SA 4.0) on the built-in Cairn template. Each note credits its source in its text.
 * Sets are never changed in place: a new one is a new folder and a new manifest hash.
 */
export type StatblockSet = '5e' | 'cairn';

export const STATBLOCK_SETS: Readonly<Record<StatblockSet, { host: string; manifest: PackedFile }>> = {
  '5e': {
    host: 'https://assets.atlas-vtt.dev/starter/statblocks-5e-3/',
    manifest: { key: 'manifest.json', bytes: 26_615, sha256: 'c7e8a94328f76cde6657719e387899358ca278d3fab485c98b5922688dc2b39a' },
  },
  cairn: {
    host: 'https://assets.atlas-vtt.dev/starter/statblocks-cairn-1/',
    manifest: { key: 'manifest.json', bytes: 26_279, sha256: '008a3c83681e5c564bfe1b25436a02501c51d4394e1f19c9790e2d9aeca43c1e' },
  },
};

/** How many of the tokens each set gives a statblock, for the choice to say. */
export const STATBLOCK_COUNTS: Readonly<Record<StatblockSet, number>> = { '5e': 145, cairn: 145 };

/** The line every note holds where the token's art goes; the install writes the art's path into it. */
const IMAGE_LINE = 'image: ""';
/** A name that is a file name in every vault: no path separators, no characters a file system refuses. */
const FILE_NAME = /^[^/\\:*?"<>|#^[\]]+$/;

interface StatblockEntry extends PackedFile {
  /** The token's key in the tokens' manifest, without its extension. */
  token: string;
  name: string;
}

/** A statblock fetched and checked, by the key of the token it belongs to. */
export interface FetchedStatblock {
  name: string;
  text: string;
}

function readManifest(bytes: ArrayBuffer): StatblockEntry[] {
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isRecord(data) || data.format !== 1 || !Array.isArray(data.notes)) throw new StockPackError('The statblocks\' manifest is of another format.');
  return data.notes.map((entry: unknown): StatblockEntry => {
    if (!isRecord(entry)) throw new StockPackError('The statblocks\' manifest names a note it does not describe.');
    const { token, key, name, bytes: size, sha256 } = entry;
    const valid = typeof token === 'string' && /^[a-z0-9-]+$/.test(token)
      && typeof key === 'string' && /^[a-z0-9-]+\.md$/.test(key)
      && typeof name === 'string' && name.trim() === name && name !== '' && FILE_NAME.test(name)
      && typeof size === 'number' && Number.isInteger(size) && size > 0
      && typeof sha256 === 'string' && /^[0-9a-f]{64}$/.test(sha256);
    if (!valid) throw new StockPackError('The statblocks\' manifest names a note it does not describe.');
    return { token, key, name, bytes: size, sha256 };
  });
}

/** The manifest of a set and its notes' sizes, before any note is fetched. */
export async function fetchStatblockManifest(set: StatblockSet, fetch: FetchBytes, pinned: PackedFile = STATBLOCK_SETS[set].manifest): Promise<StatblockEntry[]> {
  return readManifest(await fetchVerified(STATBLOCK_SETS[set].host, pinned, fetch));
}

/** Fetches and checks one note of a set. */
export async function fetchStatblock(set: StatblockSet, entry: StatblockEntry, fetch: FetchBytes): Promise<FetchedStatblock> {
  const text = new TextDecoder().decode(await fetchVerified(STATBLOCK_SETS[set].host, entry, fetch));
  if (!text.includes(IMAGE_LINE)) throw new StockPackError(`${entry.key} has no place for its token's art.`);
  return { name: entry.name, text };
}

/** The token size a statblock's creature size gives, read from the note's frontmatter. */
function sizeOf(text: string): number | undefined {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  const fields = frontmatter === undefined ? null : parseNoteYaml(frontmatter);
  return isRecord(fields) ? tokenSizeFromCreatureSize(fields.size) : undefined;
}

/**
 * Writes a statblock into the collection's `statblocks` folder under a free name, its `image`
 * the token's art so the two are linked. Returns its path and the token size it gives.
 */
export async function writeStatblock(app: App, collection: string, statblock: FetchedStatblock, imagePath: string): Promise<{ path: string; size: number | undefined }> {
  const folder = `${collectionFolderPath(collection)}/statblocks`;
  await ensureFolder(app, folder);
  const path = freePathIn(folder, `${statblock.name}.md`, (candidate) => isPathTaken(app, candidate));
  await app.vault.create(path, statblock.text.replace(IMAGE_LINE, `image: ${JSON.stringify(imagePath)}`));
  return { path, size: sizeOf(statblock.text) };
}
