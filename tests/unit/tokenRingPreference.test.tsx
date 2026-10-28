// @vitest-environment jsdom
import { useTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/useTokenPreviews';
import React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture, TextureSource } from 'pixi.js';
import { TokenPortrait } from '../../src/app/packages/components/shared/TokenPortrait';
import { syncTokenArtwork } from '../../src/app/pixi/token-renderer/tokenArtwork';
import { saveTokenPreviews } from '../../src/app/packages/components/asset-manager/token-creator/saveTokenPreviews';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { AssetService } from '../../src/app/services/AssetService';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
const crop = vi.hoisted(() => vi.fn());
vi.mock('../../src/app/packages/components/asset-manager/token-creator/tokenImages', () => ({ cropTokenImage: crop, optimizeUpload: vi.fn() }));
afterEach(cleanup);

it('preserves legacy portraits and removes the frame for an explicit opt-out', () => {
  const view = render(<TokenPortrait src="goblin.webp" alt="Goblin" />);
  expect(view.container.querySelector('.atlas-token-ring')).toBeTruthy();
  view.rerender(<TokenPortrait src="goblin.webp" alt="Goblin" showRing={false} />);
  expect(view.container.querySelector('.atlas-token-ring')).toBeNull();
  expect(view.container.querySelector('.atlas-token-portrait--unframed')).toBeTruthy();
});

// The ring image is a 230 KB data URI: set inline, every card made the browser parse it again (#137).
it('leaves the ring image to the stylesheet and sets only the tint inline', () => {
  const view = render(<TokenPortrait src="goblin.webp" alt="Goblin" ringColor="#aa0000" />);
  const ring = view.container.querySelector<HTMLElement>('.atlas-token-ring')!;
  expect(ring.style.getPropertyValue('--atlas-token-ring-image')).toBe('');
  expect(ring.style.getPropertyValue('--atlas-token-ring-color')).toBe('#aa0000');
});

it('keeps unframed art proportional and unmasked when resized or reframed', () => {
  const container = Object.assign(new Container(), { tokenData: { showRing: false } }) as TokenGroupContainer;
  const sprite = new Sprite(new Texture({ source: new TextureSource({ width: 200, height: 100 }) }));
  sprite.label = 'tokenSprite';
  const mask = new Graphics(); mask.label = 'tokenArtMask';
  const glass = new Sprite(Texture.EMPTY); glass.label = 'glassOverlay';
  container.addChild(sprite, mask, glass);
  syncTokenArtwork(container, 100);
  expect(sprite.width).toBe(100);
  expect(sprite.height).toBe(50);
  expect(sprite.mask).toBeFalsy();
  expect(glass.visible).toBe(false);
  syncTokenArtwork(container, 200);
  expect(sprite.height).toBe(100);
  container.tokenData.showRing = true;
  syncTokenArtwork(container, 100);
  expect(sprite.mask).toBe(mask);
  expect(glass.visible).toBe(true);
});

it('saves an unframed upload without baking a circular crop and persists the choice', async () => {
  Reflect.set(AssetService, 'instance', null);
  const { app, files } = createInMemoryApp();
  app.workspace = { trigger: vi.fn() };
  app.vault.createBinary = vi.fn(async (path: string) => { files.set(path, 'image'); });
  const assets = AssetService.getInstance(app);
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const preview: TokenPreview = { id: 'one', name: 'Goblin', file: new File(['art'], 'goblin.png'), previewUrl: 'blob:art', showRing: false, imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false };
  await saveTokenPreviews({ app, assetService: assets, mode: 'token', previews: [preview], collection: 'Default', tags: [], waitForOptimized: async () => ({ image: { arrayBuffer: async () => bytes } as Blob, thumbnail: null, preview: null }) });
  expect(crop).not.toHaveBeenCalled();
  expect((await assets.getTokenAssets())[0]?.showRing).toBe(false);
});

it('initializes ring controls from the asset being edited', () => {
  const { result } = renderHook(() => useTokenPreviews('token'));
  act(() => result.current.reset({ id: 'existing', name: 'Goblin', imageUrl: 'goblin.webp', tags: [], showRing: false }));
  expect(result.current.defaultRing).toBe(false);
  expect(result.current.previews[0]?.showRing).toBe(false);
  expect(result.current.previews[0]?.imageScale).toBe(1);
});

it('starts at whole-image fit when turning the ring off and keeps later zoom edits', () => {
  const { result } = renderHook(() => useTokenPreviews('token'));
  act(() => result.current.reset({ id: 'existing', name: 'Goblin', imageUrl: 'goblin.webp', tags: [], showRing: true }));
  act(() => result.current.update('existing', { imageScale: 2, imagePosition: { x: 0.2, y: -0.1 } }));
  act(() => result.current.update('existing', { showRing: false }));
  expect(result.current.previews[0]).toMatchObject({ showRing: false, imageScale: 1, imagePosition: { x: 0, y: 0 } });
  act(() => result.current.updateSelected({ imageScale: 1.8 }));
  act(() => result.current.setAllRings(false));
  expect(result.current.previews[0]?.imageScale).toBe(1.8);
  act(() => result.current.setAllRings(true));
  expect(result.current.previews[0]).toMatchObject({ showRing: true, imageScale: 0.8, imagePosition: { x: 0, y: 0 } });
  act(() => result.current.update('existing', { showRing: false }));
  expect(result.current.previews[0]).toMatchObject({ showRing: false, imageScale: 1, imagePosition: { x: 0, y: 0 } });
  act(() => result.current.updateSelected({ showRing: true }));
  expect(result.current.previews[0]).toMatchObject({ showRing: true, imageScale: 0.8, imagePosition: { x: 0, y: 0 } });
});

it('retains the original stored ringed crop when switching off and back on', () => {
  const { result } = renderHook(() => useTokenPreviews('token'));
  act(() => result.current.reset({ id: 'existing', name: 'Goblin', imageUrl: 'goblin.webp', tags: [], showRing: true }));
  const original = result.current.previews[0]!;
  expect(original.imageScale).toBe(0.8);
  act(() => result.current.update('existing', { showRing: false }));
  expect(result.current.previews[0]?.imageScale).toBe(1);
  act(() => result.current.update('existing', { showRing: true }));
  expect(result.current.previews[0]).toMatchObject({ imageScale: original.imageScale, imagePosition: original.imagePosition });
});
