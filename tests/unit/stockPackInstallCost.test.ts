// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { installBestiaryTokens } from '../../src/app/services/stockPacks/bestiaryTokens';
import type { FetchBytes, PackedFile } from '../../src/app/services/stockPacks/verifiedFetch';
import { SoundLibrary } from '../../src/app/soundLibrary/SoundLibrary';
import { SoundRoots } from '../../src/app/soundLibrary/SoundRoots';
import type { SharedSoundRoots } from '../../src/app/soundLibrary/soundRootsStore';
import { installStarterPack, STARTER_FOLDER, type StarterFile } from '../../src/app/soundLibrary/starterPack';
import { VaultLocation } from '../../src/app/soundLibrary/vaultLocation';
import { sha256 } from '../../src/app/utils/hashing';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * What installing a stock pack asks of the window (issue #621: Obsidian stopped responding while the
 * starter set came in). A pack is many files, so its install must take them one by one, each through a
 * call that waits for the network or the disk, and must do once per pack what it could do per file:
 * saving the asset index, listing the sound folder, telling the views. The network and the disk answer a
 * turn of the event loop later here, as they do in Obsidian, so calls that run together show as such.
 */

const TOKEN_HOST = 'https://assets.atlas-vtt.dev/starter/bestiary-2/';
const STATBLOCK_HOST = 'https://assets.atlas-vtt.dev/starter/statblocks-5e-3/';
const SOUND_HOST = 'https://assets.atlas-vtt.dev/starter/ambience-1/';
const INDEX_CACHE = 'atlas-vtt/.atlas-data/assets-metadata.json';
const TAGS = ['Beasts', 'Dragons', 'Undead', 'Fiends', 'Giants', 'Class'];
const SMALL = 20_000;
/** A few files of the size the real packs' largest have. */
const LARGE = 3_000_000;
/** The requests the token pack makes at a time (`PARALLEL` in `bestiaryTokens.ts`). */
const TOKEN_REQUESTS = 6;

const turn = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });

/** A file of `size` bytes that starts with `head`, so every file has bytes and a hash of its own. */
function fileOf(head: string, size: number): ArrayBuffer {
  const bytes = new Uint8Array(Math.max(size, head.length)).fill(0x20);
  bytes.set(new TextEncoder().encode(head));
  return bytes.buffer;
}

async function described(key: string, bytes: ArrayBuffer): Promise<PackedFile> {
  return { key, bytes: bytes.byteLength, sha256: await sha256(bytes) };
}

interface Calls {
  /** What each call was for: a path or an address. */
  seen: string[];
  /** The most calls that waited for their answer together. */
  atOnce: number;
}

/** Runs `answer` a turn of the event loop after it was asked, and counts what waits together. */
function answeredLater<A extends unknown[], R>(calls: Calls, answer: (...args: A) => Promise<R> | R): (...args: A) => Promise<R> {
  let waiting = 0;
  return async (...args: A): Promise<R> => {
    calls.seen.push(String(args[0]));
    calls.atOnce = Math.max(calls.atOnce, ++waiting);
    try {
      await turn();
      return await answer(...args);
    } finally {
      waiting--;
    }
  };
}

/** A network that serves `served` by address. */
function network(served: ReadonlyMap<string, ArrayBuffer>): { fetch: FetchBytes; calls: Calls } {
  const calls: Calls = { seen: [], atOnce: 0 };
  const fetch = answeredLater(calls, (url: string): ArrayBuffer => {
    const bytes = served.get(url);
    if (!bytes) throw new Error(`404 ${url}`);
    return bytes;
  });
  return { fetch, calls };
}

/** Makes a write method of the in-memory vault answer a turn later, and counts its calls. */
function disk(target: object, method: string): Calls {
  const calls: Calls = { seen: [], atOnce: 0 };
  const mock = vi.spyOn(target as Record<string, (...args: unknown[]) => Promise<unknown>>, method);
  mock.mockImplementation(answeredLater(calls, mock.getMockImplementation()!));
  return calls;
}

/** The sizes hashed since the watch began, one per call: a pack hashed whole would be one large call. */
function hashedSizes(): () => number[] {
  const digest = vi.spyOn(crypto.subtle, 'digest');
  return () => digest.mock.calls.map(([, data]) => data.byteLength).sort((a, b) => a - b);
}

const sizesOf = (served: ReadonlyMap<string, ArrayBuffer>): number[] => [...served.values()].map((bytes) => bytes.byteLength).sort((a, b) => a - b);
const unique = (paths: readonly string[]): number => new Set(paths).size;

afterEach(() => vi.restoreAllMocks());

describe('installing the starter tokens', () => {
  beforeEach(() => AssetService.resetInstance());

  interface TokenPack {
    served: Map<string, ArrayBuffer>;
    manifest: PackedFile;
    statblockManifest: PackedFile;
  }

  /** `count` tokens over `TAGS`, the first three large, every third with a statblock. */
  async function tokenPack(count: number): Promise<TokenPack> {
    const served = new Map<string, ArrayBuffer>();
    const credits = fileOf('# Credits', 900);
    served.set(`${TOKEN_HOST}credits.md`, credits);
    const tokens = [];
    const notes = [];
    for (let index = 0; index < count; index++) {
      const key = `creature-${index}`;
      const image = fileOf(`RIFF____WEBPVP8 ${key}`, index < 3 ? LARGE : SMALL);
      served.set(`${TOKEN_HOST}${key}.webp`, image);
      tokens.push({ ...(await described(`${key}.webp`, image)), name: `Creature ${index}`, tags: [TAGS[index % TAGS.length]] });
      if (index % 3 !== 0) continue;
      const note = fileOf(`---\nstatblock: true\nname: "Creature ${index}"\nsize: "Medium"\nimage: ""\n---\n`, 2_000);
      served.set(`${STATBLOCK_HOST}${key}.md`, note);
      notes.push({ ...(await described(`${key}.md`, note)), token: key, name: `Creature ${index}` });
    }
    const manifest = fileOf(JSON.stringify({ format: 2, credits: await described('credits.md', credits), tokens }), 0);
    const statblockManifest = fileOf(JSON.stringify({ format: 1, notes }), 0);
    served.set(`${TOKEN_HOST}manifest.json`, manifest);
    served.set(`${STATBLOCK_HOST}manifest.json`, statblockManifest);
    return { served, manifest: await described('manifest.json', manifest), statblockManifest: await described('manifest.json', statblockManifest) };
  }

  interface TokenInstall {
    vault: InMemoryApp;
    assets: AssetService;
    pack: TokenPack;
    requests: Calls;
    images: Calls;
    texts: Calls;
    indexSaves: number;
    hashed: number[];
  }

  async function installTokens(count: number): Promise<TokenInstall> {
    AssetService.resetInstance();
    const vault = createInMemoryApp();
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    const pack = await tokenPack(count);
    const { fetch, calls: requests } = network(pack.served);
    const images = disk(vault.app.vault, 'createBinary');
    const texts = disk(vault.app.vault, 'create');
    const index = disk(vault.app.vault.adapter, 'write');
    const hashed = hashedSizes();
    const added = await installBestiaryTokens(vault.app, assets, assets.getDefaultCollectionId(), { fetch, manifest: pack.manifest, statblocks: '5e', statblockManifest: pack.statblockManifest });
    expect(added).toBe(count);
    return { vault, assets, pack, requests, images, texts, indexSaves: index.seen.filter((path) => path === INDEX_CACHE).length, hashed: hashed() };
  }

  it('fetches a few files at a time, and hashes each alone', async () => {
    const { pack, requests, hashed } = await installTokens(60);
    expect(unique(requests.seen)).toBe(pack.served.size);
    expect(requests.seen).toHaveLength(pack.served.size);
    expect(requests.atOnce).toBeLessThanOrEqual(TOKEN_REQUESTS);
    // One hash per file, of that file's bytes: nothing puts the pack together to hash it.
    expect(hashed).toEqual(sizesOf(pack.served));
  });

  it('writes one file at a time, each once', async () => {
    const { vault, images, texts } = await installTokens(60);
    expect(images.seen).toHaveLength(60);
    expect(unique(images.seen)).toBe(60);
    expect(images.atOnce).toBe(1);
    const notes = texts.seen.filter((path) => path.includes('/statblocks/'));
    expect(notes).toHaveLength(20);
    expect(unique(notes)).toBe(20);
    expect(unique(texts.seen)).toBe(texts.seen.length);
    // The views are told once, when the whole pack is in.
    expect(vi.mocked(vault.app.workspace.trigger).mock.calls.filter(([name]) => name === 'atlas-vtt:refresh-assets')).toHaveLength(1);
  });

  it('saves the asset index as often for sixty tokens as for six', async () => {
    const few = await installTokens(TAGS.length);
    const many = await installTokens(60);
    expect(many.indexSaves).toBe(few.indexSaves);
    // A save for each tag the collection lacked, one for all the tokens and one for the credits note.
    expect(many.indexSaves).toBeLessThanOrEqual(TAGS.length + 2);
    expect((await many.assets.getTokenAssets()).filter((token) => token.id.startsWith('token-bestiary-'))).toHaveLength(60);
  });
});

describe('installing the starter ambience', () => {
  let library: SoundLibrary | null = null;

  afterEach(() => {
    library?.destroy();
    library = null;
  });

  /** A library with nothing linked, so the pack goes to the default vault folder. */
  function open(vault: InMemoryApp): SoundLibrary {
    let shared: SharedSoundRoots = {};
    const roots = new SoundRoots({
      shared: () => shared,
      setShared: (next) => { shared = next; },
      onSharedChange: () => () => undefined,
      local: () => null,
      setLocal: () => undefined,
      localOriginals: () => null,
      setLocalOriginals: () => undefined,
      vaultBase: () => '/vault',
      realPath: async (value) => value,
    });
    library = new SoundLibrary({
      roots,
      open: (root) => (root.status === 'vault' ? new VaultLocation(vault.app, root.path) : null),
      probeSeconds: async () => null,
    });
    return library;
  }

  /** `count` sounds, the first three large, and the credits. */
  async function soundPack(count: number): Promise<{ files: StarterFile[]; served: Map<string, ArrayBuffer> }> {
    const served = new Map<string, ArrayBuffer>();
    const files: StarterFile[] = [];
    for (let index = 0; index < count; index++) {
      const bytes = fileOf(`OggS loop ${index}`, index < 3 ? LARGE : SMALL);
      served.set(`${SOUND_HOST}loop-${index}.ogg`, bytes);
      files.push({ ...(await described(`loop-${index}.ogg`, bytes)), name: `Loop ${index}.ogg`, type: 'audio/ogg' });
    }
    const credits = fileOf('# Credits', 900);
    served.set(`${SOUND_HOST}credits.md`, credits);
    files.push({ ...(await described('credits.md', credits)), name: 'Credits.md', type: 'text/markdown' });
    return { files, served };
  }

  interface SoundInstall {
    served: Map<string, ArrayBuffer>;
    requests: Calls;
    writes: Calls;
    listings: number;
    told: number;
    listed: number;
    hashed: number[];
  }

  async function installSounds(count: number): Promise<SoundInstall> {
    library?.destroy();
    const vault = createInMemoryApp({ folders: [] });
    const opened = open(vault);
    const { files, served } = await soundPack(count);
    const { fetch, calls: requests } = network(served);
    const writes = disk(vault.app.vault, 'createBinary');
    const listings = vi.spyOn(VaultLocation.prototype, 'list');
    listings.mockClear();
    let told = 0;
    opened.onChange(() => { told++; });
    const hashed = hashedSizes();
    await installStarterPack(opened, { files, fetch });
    const inPack = opened.filesOf('ambience').filter(({ entry }) => entry.path.startsWith(`${STARTER_FOLDER}/`));
    return { served, requests, writes, listings: listings.mock.calls.length, told, listed: inPack.length, hashed: hashed() };
  }

  it('fetches one file at a time, hashes each alone and writes each once', async () => {
    const { served, requests, writes, listed, hashed } = await installSounds(60);
    expect(requests.seen).toHaveLength(61);
    expect(requests.atOnce).toBe(1);
    expect(hashed).toEqual(sizesOf(served));
    expect(writes.seen).toHaveLength(61);
    expect(unique(writes.seen)).toBe(61);
    expect(writes.atOnce).toBe(1);
    expect(listed).toBe(60);
  });

  it('lists the folder and tells the views as often for sixty sounds as for six', async () => {
    const few = await installSounds(6);
    const many = await installSounds(60);
    expect(many.listings).toBe(few.listings);
    expect(many.told).toBe(few.told);
    expect(many.listings).toBeLessThanOrEqual(4);
  });
});
