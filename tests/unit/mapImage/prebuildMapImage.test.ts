import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import type { BytesSource } from '../../../src/app/pixi/mapImage/TileDecoderClient';
import type { FileIdentity } from '../../../src/app/pixi/mapImage/tileProtocol';

const prebuild = vi.fn<(source: BytesSource, identity: FileIdentity | null) => Promise<boolean>>();
const forApp = vi.fn(() => ({ prebuild }));
vi.mock('../../../src/app/pixi/mapImage/TileDecoderClient', () => ({ TileDecoderClient: { forApp } }));

const { prebuildMapImage, prebuildMapImageAt } = await import('../../../src/app/pixi/mapImage/prebuildMapImage');

function mapFile(path: string): TFile {
  const file = new TFile(path);
  file.stat = { ctime: 1, mtime: 1700, size: 4096 };
  return file;
}

function appWith(files: TFile[], readBinary = vi.fn(() => Promise.resolve(new ArrayBuffer(8)))): App {
  const byPath = new Map(files.map((file) => [file.path, file]));
  return { vault: { readBinary, getAbstractFileByPath: (path: string) => byPath.get(path) ?? null } } as unknown as App;
}

describe('prebuildMapImage', () => {
  afterEach(() => vi.clearAllMocks());

  it('builds by the file identity and reads the file only when asked', async () => {
    prebuild.mockResolvedValue(true);
    const file = mapFile('atlas-vtt/assets/Crypt.webp');
    const readBinary = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
    const app = appWith([file], readBinary);
    prebuildMapImage(app, file);
    expect(forApp).toHaveBeenCalledWith(app);
    const [source, identity] = prebuild.mock.calls[0]!;
    expect(identity).toEqual({ path: 'atlas-vtt/assets/Crypt.webp', size: 4096, mtime: 1700 });
    expect(readBinary).not.toHaveBeenCalled();
    expect(typeof source).toBe('function');
    await (source as () => Promise<ArrayBuffer>)();
    expect(readBinary).toHaveBeenCalledWith(file);
  });

  it('only logs a build that fails', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    prebuild.mockRejectedValue(new Error('Storage full'));
    const file = mapFile('atlas-vtt/assets/Crypt.webp');
    expect(() => prebuildMapImage(appWith([file]), file)).not.toThrow();
    await vi.waitFor(() => expect(debug).toHaveBeenCalled());
    debug.mockRestore();
  });

  it('builds a file found by its path and nothing for a missing one', () => {
    prebuild.mockResolvedValue(true);
    const file = mapFile('atlas-vtt/assets/Crypt.webp');
    const app = appWith([file]);
    prebuildMapImageAt(app, 'atlas-vtt/assets/Gone.webp');
    expect(prebuild).not.toHaveBeenCalled();
    prebuildMapImageAt(app, file.path);
    expect(prebuild.mock.calls[0]![1]).toMatchObject({ path: file.path });
  });
});
