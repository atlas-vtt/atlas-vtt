import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice, TFile } from 'obsidian';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
const decoded = vi.hoisted(() => ({ width: 640, height: 480, close: (): void => undefined }));
vi.mock('../../../src/app/pixi/decodedImage', () => ({
  decodeImage: vi.fn(async () => decoded),
  imageMimeType: (extension: string): string => (extension === 'svg' ? 'image/svg+xml' : 'image/webp'),
}));

import { MapImageService } from '../../../src/app/pixi/mapImage/MapImageService';
import { TileOpenError, type MainThreadDecode, type TileDecoderClient } from '../../../src/app/pixi/mapImage/TileDecoderClient';
import { pyramidOf } from '../../../src/app/pixi/mapImage/pyramid';

const opened = { handle: 1, hash: 'h', pyramid: pyramidOf(640, 480) };

function setup(): { service: MapImageService; open: ReturnType<typeof vi.fn>; file: (path: string) => TFile } {
  const { app } = createInMemoryApp({ files: { 'maps/a.webp': 'a', 'maps/b.webp': 'b', 'maps/c.svg': '<svg/>' } });
  vi.stubGlobal('ImageBitmap', Object);
  const open = vi.fn();
  const service = new MapImageService(app, { open } as unknown as TileDecoderClient);
  const file = (path: string): TFile => app.vault.getAbstractFileByPath(path) as TFile;
  return { service, open, file };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(Notice).mockClear();
  vi.restoreAllMocks();
});

describe('MapImageService', () => {
  it('tells the GM once per file that its image cannot be shown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, file } = setup();

    service.reportUnshown(file('maps/a.webp'), new Error('broken'));
    service.reportUnshown(file('maps/a.webp'), new Error('broken'));
    service.reportUnshown(file('maps/b.webp'), new Error('broken'));

    expect(Notice).toHaveBeenCalledTimes(2);
    expect(vi.mocked(Notice).mock.calls[0]?.[0]).toContain('maps/a.webp');
  });

  it('names the size and the limit of an image too large to decode', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, file } = setup();

    service.reportUnshown(file('maps/a.webp'), new TileOpenError({ kind: 'too-large', width: 70000, height: 100, maxSide: 65535, maxPixels: 536_870_911 }));

    expect(vi.mocked(Notice).mock.calls[0]?.[0]).toContain('70,000 × 100');
    expect(vi.mocked(Notice).mock.calls[0]?.[0]).toContain('536 megapixels');
  });

  it('opens an image by its path, size and time, reading its bytes only through the vault', async () => {
    const { service, open, file } = setup();
    open.mockResolvedValue(opened);
    const image = file('maps/a.webp');

    await expect(service.open(image)).resolves.toBe(opened);

    const [read, identity, decode] = open.mock.calls[0] as [() => Promise<ArrayBuffer>, unknown, MainThreadDecode | undefined];
    expect(identity).toEqual({ path: 'maps/a.webp', size: image.stat.size, mtime: image.stat.mtime });
    expect(decode).toBeUndefined();
    expect(new TextDecoder().decode(await read())).toBe('a');
  });

  it('decodes an SVG on this thread, which a worker cannot', async () => {
    const { service, open, file } = setup();
    open.mockResolvedValue(opened);

    await service.open(file('maps/c.svg'));

    const decode = open.mock.calls[0]?.[2] as MainThreadDecode;
    await expect(decode(new ArrayBuffer(4))).resolves.toBe(decoded);
  });

  it('decodes on this thread what the worker could not decode', async () => {
    const { service, open, file } = setup();
    open.mockRejectedValueOnce(new TileOpenError({ kind: 'decode-failed', message: 'no' })).mockResolvedValueOnce(opened);

    await expect(service.open(file('maps/a.webp'))).resolves.toBe(opened);

    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]?.[2]).toBeTypeOf('function');
  });

  it('does not retry an image that is too large', async () => {
    const { service, open, file } = setup();
    open.mockRejectedValue(new TileOpenError({ kind: 'too-large', width: 70000, height: 100, maxSide: 65535, maxPixels: 1 }));

    await expect(service.open(file('maps/a.webp'))).rejects.toBeInstanceOf(TileOpenError);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
