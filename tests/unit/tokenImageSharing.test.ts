import { beforeEach, expect, it, vi } from 'vitest';
import type { ProcessedImage } from '../../src/app/imageProcessing/imageProcessing';
import { statblockPreviewImages } from '../../src/app/packages/components/asset-manager/token-creator/statblockPreviewImages';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const render = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/imageProcessing/imageProcessing', () => ({
  IMAGE_PRESETS: { token: { maxWidth: 1024, quality: 0.9 }, map: { maxWidth: 4096, quality: 0.85 } },
  optimizeImage: vi.fn(),
  renderFramedImage: render,
}));
vi.mock('../../src/app/services/AssetThumbnailService', () => ({ THUMBNAIL_SPEC: { size: 256, quality: 0.8 } }));

const { cropTokenImage } = await import('../../src/app/packages/components/asset-manager/token-creator/tokenImages');

const result = (name: string): ProcessedImage => ({ image: new Blob([name]), thumbnail: null, preview: null, sourcePreview: null });
const abortable = (signal: AbortSignal | undefined, name: string): Promise<ProcessedImage> => new Promise((resolve, reject) => {
  signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  setTimeout(() => resolve(result(name)), 0);
});

beforeEach(() => { render.mockReset(); });

it('converts shared art once however many previews crop it alike', async () => {
  render.mockImplementation(async () => result('crop'));
  const art = new File(['art'], 'goblin.png');
  const [first, second] = await Promise.all([cropTokenImage(art, 1, { x: 0, y: 0 }), cropTokenImage(art, 1, { x: 0, y: 0 })]);
  expect(first).toBe(second);
  await cropTokenImage(art, 1.5, { x: 0, y: 0 });
  await cropTokenImage(new File(['art'], 'goblin.png'), 1, { x: 0, y: 0 });
  expect(render).toHaveBeenCalledTimes(3);
});

it('keeps framed crops separate from scaled ringless art for the same source', async () => {
  render.mockImplementation(async () => result('crop'));
  const art = new File(['art'], 'goblin.png');
  await cropTokenImage(art, 2, { x: 0, y: 0 });
  await cropTokenImage(art, 2, { x: 0, y: 0 }, undefined, false, false);
  expect(render).toHaveBeenCalledTimes(2);
  expect(render.mock.calls[1]![1]).toEqual({ centerX: 0.5, centerY: 0.5, width: 2, fit: 'contain' });
});

it('starts a shared conversion again when the caller that started it cancels', async () => {
  render.mockImplementation((_file: File, _placement: unknown, options: { signal?: AbortSignal }) => abortable(options.signal, 'crop'));
  const art = new File(['art'], 'goblin.png');
  const starter = new AbortController();
  const cancelled = cropTokenImage(art, 1, { x: 0, y: 0 }, starter.signal);
  const waiting = cropTokenImage(art, 1, { x: 0, y: 0 });
  starter.abort();
  await expect(cancelled).rejects.toThrow('Aborted');
  expect(await waiting).toMatchObject({ image: expect.any(Blob) });
  expect(render).toHaveBeenCalledTimes(2);
});

it('forgets a failed conversion so the next attempt converts again', async () => {
  render.mockRejectedValueOnce(new Error('Could not decode')).mockImplementation(async () => result('crop'));
  const art = new File(['art'], 'goblin.png');
  await expect(cropTokenImage(art, 1, { x: 0, y: 0 })).rejects.toThrow('Could not decode');
  await expect(cropTokenImage(art, 1, { x: 0, y: 0 })).resolves.toMatchObject({ image: expect.any(Blob) });
});

it('reads art shared by several statblocks once, so its conversions are shared too', async () => {
  const { app } = createInMemoryApp({ files: { 'Art/wolf.webp': 'art', 'Art/bat.webp': 'art' } });
  const readBinary = vi.spyOn(app.vault, 'readBinary');
  const row = (name: string, imagePath: string) => ({ name, path: `Bestiary/${name}.md`, imagePath, status: 'ready' as const, detail: 'Ready' });
  const images = await statblockPreviewImages(app, [row('Wolf', 'Art/wolf.webp'), row('Dire Wolf', 'Art/wolf.webp'), row('Bat', 'Art/bat.webp')], new AbortController().signal);
  expect(images[0]!.file).toBe(images[1]!.file);
  expect(images[2]!.file).not.toBe(images[0]!.file);
  expect(readBinary).toHaveBeenCalledTimes(2);
});
