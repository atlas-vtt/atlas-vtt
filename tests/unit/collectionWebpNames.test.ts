// @vitest-environment node
// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { optimizeImage, renderThumbnail } from '../../src/app/imageProcessing/imageProcessing';
import { AssetService } from '../../src/app/services/AssetService';
import { zipPathFor } from '../../src/app/services/collectionBundle/bundleFormat';
import type { CoverChoice } from '../../src/app/services/collectionBundle/collectionCover';
import { exportCollectionBundle, prepareCollectionExport, type ExportChoice, type ExportedBundle } from '../../src/app/services/collectionBundle/collectionExport';
import { createInMemoryApp, interceptWrites, type InMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/atlas-view', () => ({
  ATLAS_VIEW_TYPE: 'atlas-vtt',
  AtlasView: class { async saveMap(): Promise<void> {} },
}));

// The encoders need a canvas, which Node lacks; `tests/gpu/webpNamedImages.gpu.test.ts` runs the real ones.
vi.mock('../../src/app/imageProcessing/imageProcessing', () => ({ optimizeImage: vi.fn(), renderThumbnail: vi.fn() }));

const bytes = (...parts: number[][]): Uint8Array => new Uint8Array(parts.flat());
const text = (value: string): number[] => [...value].map((c) => c.charCodeAt(0));
const u32be = (n: number): number[] => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const webp = (mark: number): Uint8Array =>
  bytes(text('RIFF'), [100, 0, 0, 0], text('WEBP'), text('VP8 '), [10, 0, 0, 0], [0, 0, 0, 0x9d, 0x01, 0x2a, 64, 0, 64, 0, mark]);

const PNG = bytes([0x89], text('PNG\r\n\x1a\n'), u32be(13), text('IHDR'), u32be(64), u32be(64));
const JPEG = bytes([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 64, 0, 64, 3], new Array<number>(12).fill(0));
const STORED_WEBP = webp(1);
const ENCODED_COVER = webp(2);
const ENCODED_THUMBNAIL = webp(3);

const COVER = 'atlas-vtt/collections/source/cover.webp';
const TOKEN_IMAGE = 'atlas-vtt/assets/goblin_1.png';
const TOKEN_THUMBNAIL = 'atlas-vtt/assets/thumbnails/goblin_1-abc.webp';

interface Bench {
  vault: InMemoryApp;
  assets: AssetService;
  /** The bytes of binary files, which the in-memory vault would keep as text. */
  binaries: Map<string, Uint8Array>;
  /** Paths of the binary files written since the vault was set up. */
  written: string[];
}

/** A collection with one token, whose thumbnail and cover hold `stored`. */
async function bench(stored: { cover?: Uint8Array; thumbnail?: Uint8Array }): Promise<Bench> {
  const vault = createInMemoryApp();
  const binaries = new Map<string, Uint8Array>();
  const written: string[] = [];
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    (binaries.get(file.path) ?? new TextEncoder().encode(vault.files.get(file.path) ?? '')).slice().buffer;
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('source');
  const files: Record<string, Uint8Array | undefined> = { [TOKEN_IMAGE]: PNG, [TOKEN_THUMBNAIL]: stored.thumbnail ?? STORED_WEBP, [COVER]: stored.cover };
  for (const [path, data] of Object.entries(files)) {
    if (!data) continue;
    await vault.app.vault.create(path, '');
    binaries.set(path, data);
  }
  await assets.addTokenAsset({ name: 'Goblin', imagePath: TOKEN_IMAGE, thumbnailPath: TOKEN_THUMBNAIL, showRing: false, collection: 'source', tags: [] });
  if (stored.cover) await assets.recordCollectionRelease('source', { version: 1, releasedAt: 1, coverPath: COVER });
  const keep = (target: unknown, content: unknown): void => {
    const path = target instanceof TFile ? target.path : String(target);
    if (!(content instanceof ArrayBuffer)) return;
    binaries.set(path, new Uint8Array(content));
    written.push(path);
  };
  interceptWrites(vault.app.vault, 'modifyBinary', keep);
  interceptWrites(vault.app.vault, 'createBinary', keep);
  return { vault, assets, binaries, written };
}

async function exportFrom({ vault, assets }: Bench, choice: Partial<ExportChoice> & { cover?: CoverChoice } = {}): Promise<ExportedBundle> {
  const preview = await prepareCollectionExport(vault.app, assets, 'source');
  return exportCollectionBundle(vault.app, assets, preview, { kind: 'release', version: preview.suggestedVersion, ...choice } as ExportChoice);
}

async function packed(bundle: ExportedBundle, path: string): Promise<Uint8Array | undefined> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await bundle.blob.arrayBuffer());
  return zip.file(zipPathFor(path))?.async('uint8array');
}

beforeEach(() => {
  vi.mocked(optimizeImage).mockReset().mockResolvedValue({ image: new Blob([ENCODED_COVER]), thumbnail: null, preview: null, sourcePreview: null });
  vi.mocked(renderThumbnail).mockReset().mockResolvedValue(ENCODED_THUMBNAIL.slice().buffer);
});

describe('files a collection stores under WebP names', () => {
  it.each<[string, CoverChoice]>([
    ['an uploaded PNG', { kind: 'upload', image: new Blob([PNG]) }],
    ['an uploaded JPEG', { kind: 'upload', image: new Blob([JPEG]) }],
    ['artwork of the collection', { kind: 'artwork', path: TOKEN_IMAGE }],
  ])('asks for a WebP when a new cover is made from %s', async (_name, cover) => {
    const b = await bench({});

    const bundle = await exportFrom(b, { cover });
    await bundle.commit();

    expect(optimizeImage).toHaveBeenCalledWith(expect.any(Blob), { maxWidth: 1600, maxHeight: 1600, quality: 0.85 }, { webpOnly: true });
    expect(await packed(bundle, COVER)).toEqual(ENCODED_COVER);
    expect(b.binaries.get(COVER)).toEqual(ENCODED_COVER);
  });

  it.each([['PNG', PNG], ['JPEG', JPEG]])('exports a stored cover that holds a %s as WebP and replaces it in the vault', async (_name, stored) => {
    const b = await bench({ cover: stored });

    const bundle = await exportFrom(b);

    expect(new Uint8Array(await vi.mocked(optimizeImage).mock.calls[0]![0].arrayBuffer())).toEqual(stored);
    expect(await packed(bundle, COVER)).toEqual(ENCODED_COVER);
    // The vault changes only once the release is recorded.
    expect(b.written).toEqual([]);
    await bundle.commit();
    expect(b.binaries.get(COVER)).toEqual(ENCODED_COVER);
    expect((await b.assets.getCollection('source'))?.coverPath).toBe(COVER);

    // The next export finds a WebP and converts nothing.
    vi.mocked(optimizeImage).mockClear();
    b.written.length = 0;
    const next = await exportFrom(b);
    await next.commit();
    expect(optimizeImage).not.toHaveBeenCalled();
    expect(await packed(next, COVER)).toEqual(ENCODED_COVER);
    expect(b.written).toEqual([]);
  });

  it('shares a mislabelled cover as WebP and leaves the vault as its install record knows it', async () => {
    const b = await bench({ cover: PNG, thumbnail: PNG });

    const bundle = await exportFrom(b, { kind: 'share' });
    await bundle.commit();

    expect(await packed(bundle, COVER)).toEqual(ENCODED_COVER);
    expect(await packed(bundle, TOKEN_THUMBNAIL)).toEqual(ENCODED_THUMBNAIL);
    expect(b.written).toEqual([]);
    expect(b.binaries.get(COVER)).toEqual(PNG);
  });

  it('exports a cover that is a WebP byte for byte and does not rewrite it', async () => {
    const b = await bench({ cover: STORED_WEBP });

    const bundle = await exportFrom(b);
    await bundle.commit();

    expect(optimizeImage).not.toHaveBeenCalled();
    expect(await packed(bundle, COVER)).toEqual(STORED_WEBP);
    expect(b.written).toEqual([]);
  });

  it('exports a mislabelled cover that cannot be decoded as it is', async () => {
    const b = await bench({ cover: PNG });
    vi.mocked(optimizeImage).mockRejectedValue(new Error('Could not decode the image.'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const bundle = await exportFrom(b);
    await bundle.commit();

    expect(await packed(bundle, COVER)).toEqual(PNG);
    expect(b.written).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it.each([['PNG', PNG], ['JPEG', JPEG]])('exports a thumbnail that holds a %s as WebP and replaces it in the vault', async (_name, stored) => {
    const b = await bench({ thumbnail: stored });

    const bundle = await exportFrom(b);

    expect(new Uint8Array(await vi.mocked(renderThumbnail).mock.calls[0]![0].arrayBuffer())).toEqual(stored);
    expect(await packed(bundle, TOKEN_THUMBNAIL)).toEqual(ENCODED_THUMBNAIL);
    expect(b.written).toEqual([]);
    await bundle.commit();
    expect(b.binaries.get(TOKEN_THUMBNAIL)).toEqual(ENCODED_THUMBNAIL);
    expect(b.written).toEqual([TOKEN_THUMBNAIL]);
  });

  it('exports thumbnails and artwork that are what their names say byte for byte', async () => {
    const b = await bench({});

    const bundle = await exportFrom(b);
    await bundle.commit();

    expect(renderThumbnail).not.toHaveBeenCalled();
    expect(await packed(bundle, TOKEN_THUMBNAIL)).toEqual(STORED_WEBP);
    expect(await packed(bundle, TOKEN_IMAGE)).toEqual(PNG);
    expect(b.written).toEqual([]);
  });
});
