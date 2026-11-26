// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedImage } from '../../src/app/imageProcessing/imageProcessing';
import { useTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/useTokenPreviews';
import { creatorDraft, discardCreatorDrafts, keepCreatorSettings, rememberedCollection } from '../../src/app/packages/components/asset-manager/token-creator/creatorDraft';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubLayout } from '../mocks/jsdomLayout';

const convert = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ convertForPreview: convert }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetCatalog', () => ({
  useAssetCatalog: () => ({ assetService: {}, collections: [{ id: 'default', name: 'Default' }, { id: 'Dungeons', name: 'Dungeons' }] }),
}));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetTags', () => ({ useAssetTags: () => ({ tags: [], createTag: vi.fn(), isCreatingTag: false }) }));
stubLayout({ width: 800, height: 600 });

const converted = (): ProcessedImage => ({ image: new Blob(['token']), thumbnail: null, preview: null, sourcePreview: new Blob(['card']) });
const art = (name: string): File => new File(['art'], `${name}.png`, { type: 'image/png' });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  convert.mockReset();
  convert.mockResolvedValue(converted());
  let url = 0;
  URL.createObjectURL = vi.fn(() => `blob:${url++}`);
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});
afterEach(() => {
  cleanup();
  discardCreatorDrafts();
  vi.useRealTimers();
});

describe('the previews of a creator that closes', () => {
  it('come back as they were left when it opens again, without converting again', async () => {
    const first = renderHook(() => useTokenPreviews('token', true));
    act(() => first.result.current.addFiles([art('Wolf'), art('Bear')]));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    act(() => first.result.current.update(first.result.current.previews[0]!.id, { name: 'Dire wolf', imageScale: 1.5 }));
    const left = first.result.current.previews;
    first.unmount();

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    const again = renderHook(() => useTokenPreviews('token', true));
    expect(again.result.current.previews).toEqual(left);
    expect(again.result.current.previews[0]).toMatchObject({ name: 'Dire wolf', imageScale: 1.5 });
    expect(convert).toHaveBeenCalledTimes(2);
    expect(await again.result.current.waitForOptimized(left[0]!.id, 'default-crop')).toBeDefined();
  });

  it('convert again where the conversion had not finished', async () => {
    convert.mockImplementationOnce(() => new Promise<ProcessedImage>(() => {}));
    const first = renderHook(() => useTokenPreviews('token', true));
    act(() => first.result.current.addFiles([art('Wolf')]));
    first.unmount();
    expect(creatorDraft('token')?.previews[0]?.isOptimizing).toBe(true);

    const again = renderHook(() => useTokenPreviews('token', true));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(convert).toHaveBeenCalledTimes(2);
    expect(again.result.current.previews[0]).toMatchObject({ isOptimizing: false, previewUrl: expect.stringMatching(/^blob:/) });
  });

  it('are not kept while a token is edited, and leave a draft of another kind alone', async () => {
    const creating = renderHook(() => useTokenPreviews('map', true));
    act(() => creating.result.current.addFiles([art('Cave')]));
    creating.unmount();

    const editing = renderHook(() => useTokenPreviews('token', false));
    act(() => editing.result.current.addFiles([art('Replacement')]));
    editing.unmount();

    expect(creatorDraft('token')).toBeUndefined();
    expect(creatorDraft('map')?.previews).toHaveLength(1);
  });
});

describe('the collection a creator remembers', () => {
  it('is the one picked in it, for the collection it was opened in', () => {
    keepCreatorSettings('token', { collection: { openedFor: 'default', chosen: 'Dungeons' } });
    expect(rememberedCollection('token', 'default')).toBe('Dungeons');
    expect(rememberedCollection('token', 'Forest')).toBe('Forest');
    expect(rememberedCollection('map', 'default')).toBe('default');
  });
});

describe('the token creator', () => {
  const { app } = createInMemoryApp();
  const open = (onClose = vi.fn()): ReturnType<typeof render> => render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <TokenCreator isOpen onClose={onClose} selectedCollection="default" />
    </AtlasUIContext.Provider>,
  );
  const pick = (container: HTMLElement, files: File[]): void => {
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files } });
  };

  it('closed by Escape opens again with the images picked in it', async () => {
    const onClose = vi.fn();
    const first = open(onClose);
    pick(first.container, [art('Wolf'), art('Bear'), art('Owl')]);
    await screen.findByDisplayValue('Owl');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    const again = open();
    await waitFor(() => expect(again.container.querySelectorAll('.atlas-token-card')).toHaveLength(3));
    expect(screen.getByDisplayValue('Wolf')).toBeTruthy();
  });

  it('reads Cancel while it holds no images', () => {
    const onClose = vi.fn();
    open(onClose);
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drops its draft and its choices when the work is discarded', async () => {
    const onClose = vi.fn();
    const first = open(onClose);
    pick(first.container, [art('Wolf')]);
    await screen.findByDisplayValue('Wolf');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    first.unmount();

    expect(creatorDraft('token')).toBeUndefined();
    const again = open();
    expect(again.container.querySelectorAll('.atlas-token-card')).toHaveLength(0);
  });
});
