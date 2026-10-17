import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProcessedImage } from '../../src/app/imageProcessing/imageProcessing';
import { useTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/useTokenPreviews';
import { defaultImageSource } from '../../src/app/services/tokenImageSources';
import { cropReset } from '../../src/app/packages/components/asset-manager/token-creator/cropMath';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const convert = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ convertForPreview: convert }));

const result = (): ProcessedImage => ({ image: new Blob(['token']), thumbnail: null, preview: null, sourcePreview: new Blob(['card']) });
const files = (count: number): File[] => Array.from({ length: count }, (_, index) => new File(['art'], `token-${index}.png`, { type: 'image/png' }));

beforeEach(() => {
  vi.useFakeTimers();
  convert.mockReset();
  let url = 0;
  URL.createObjectURL = vi.fn(() => `blob:${url++}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(app?: Parameters<typeof useTokenPreviews>[1]): { current: ReturnType<typeof useTokenPreviews>; renders: () => number } {
  let renders = 0;
  const { result: hook } = renderHook(() => { renders += 1; return useTokenPreviews('token', app); });
  return { get current() { return hook.current; }, renders: () => renders };
}

it('shows the conversions that finish together in one list update', async () => {
  const finishers: Array<() => void> = [];
  convert.mockImplementation(() => new Promise<ProcessedImage>(resolve => finishers.push(() => resolve(result()))));
  const hook = mount();
  act(() => hook.current.addFiles(files(200)));
  expect(hook.current.optimization).toEqual({ done: 0, total: 200 });

  const before = hook.renders();
  await act(async () => { finishers.forEach(finish => finish()); await vi.advanceTimersByTimeAsync(200); });
  expect(hook.renders() - before).toBeLessThanOrEqual(3);
  expect(hook.current.previews.every(p => !p.isOptimizing && p.previewUrl.startsWith('blob:'))).toBe(true);
});

it('shows the whole image on the card and keeps the default crop for saving', async () => {
  const converted = result();
  convert.mockResolvedValue(converted);
  const hook = mount();
  act(() => hook.current.addFiles(files(1)));
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  const [preview] = hook.current.previews;
  expect(convert).toHaveBeenCalledWith(preview!.file, 'token', true, expect.any(AbortSignal));
  expect(URL.createObjectURL).toHaveBeenCalledWith(converted.sourcePreview);
  expect(await hook.current.waitForOptimized(preview!.id, 'default-crop')).toBe(converted);
  expect(await hook.current.waitForOptimized(preview!.id, 'whole')).toBeUndefined();
});

it('removes saved previews in one update and cancels their conversions', () => {
  const signals: AbortSignal[] = [];
  convert.mockImplementation((_file: File, _mode: string, _framed: boolean, signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<ProcessedImage>(() => undefined);
  });
  const hook = mount();
  act(() => hook.current.addFiles(files(3)));
  const [first, second, third] = hook.current.previews;
  const before = hook.renders();
  act(() => hook.current.removeMany([first!.id, third!.id]));
  expect(hook.renders() - before).toBe(1);
  expect(hook.current.previews.map(p => p.id)).toEqual([second!.id]);
  expect(signals.map(signal => signal.aborted)).toEqual([true, false, true]);
  expect(hook.current.optimization).toEqual({ done: 0, total: 1 });
});

it('reopens the source with both saved ring crops and resets to the original upload baseline', () => {
  const hook = mount();
  const imageSource = {
    ...defaultImageSource('atlas-vtt/assets/token-sources/original.png'),
    framed: { imageScale: 1.6, imagePosition: { x: 0.1, y: -0.2 } },
    unframed: { imageScale: 2.3, imagePosition: { x: -0.1, y: 0.2 } },
  };
  act(() => hook.current.reset({ id: 'token', name: 'Token', imageUrl: 'app://rendered', sourceImageUrl: 'app://original', imageSource, showRing: false, tags: [] }));
  expect(hook.current.previews[0]).toMatchObject({ previewUrl: 'app://original', ...imageSource.unframed, alternateCrop: imageSource.framed });
  act(() => hook.current.update('token', { showRing: true }));
  expect(hook.current.previews[0]).toMatchObject({ ...imageSource.framed, alternateCrop: imageSource.unframed });
  expect(cropReset(hook.current.previews[0]!)).toEqual({ imageScale: 1, imagePosition: { x: 0, y: 0 } });
});

it('converts a preserved source for the card without replacing its saved crop or treating it as an upload', async () => {
  const path = 'atlas-vtt/assets/token-sources/original.png';
  const { app } = createInMemoryApp({ files: { [path]: 'original pixels' } });
  const hook = mount(app);
  const converted = result();
  convert.mockResolvedValue(converted);
  const imageSource = { ...defaultImageSource(path), framed: { imageScale: 2, imagePosition: { x: 0.1, y: 0 } } };
  act(() => hook.current.reset({ id: 'token', name: 'Token', imageUrl: 'app://rendered', sourceImageUrl: 'app://huge-original', imageSource, tags: [] }));
  expect(hook.current.previews[0]).toMatchObject({ previewUrl: '', isOptimizing: true, file: null });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  expect(convert).toHaveBeenCalledWith(expect.any(File), 'token', false, expect.any(AbortSignal));
  const file = convert.mock.calls[0]![0] as File;
  expect(file.name).toBe('original.png');
  expect(file.size).toBe('original pixels'.length);
  expect(hook.current.previews[0]).toMatchObject({ previewUrl: 'blob:0', isOptimizing: false, file: null, ...imageSource.framed });
  expect(await hook.current.waitForOptimized('token', 'default-crop')).toBeUndefined();
  expect(await hook.current.waitForOptimized('token', 'whole')).toBe(converted);
});
