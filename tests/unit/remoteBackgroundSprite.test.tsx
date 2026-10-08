import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const log: string[] = [];
const remote = vi.hoisted(() => ({ on: false }));
const cache = vi.hoisted(() => ({ acquire: vi.fn(), release: vi.fn() }));
const viewport = vi.hoisted(() => ({
  addChild: vi.fn(), sortChildren: vi.fn(), moveCenter: vi.fn(), worldWidth: 0, worldHeight: 0,
}));

vi.mock('pixi.js', () => ({
  Sprite: class {
    parent: unknown = null; visible = true; renderable = true; destroyed = false;
    width = 0; height = 0; x = 0; y = 0; zIndex = 0;
    constructor(public texture: { name: string }) {}
  },
  Texture: class {},
}));
vi.mock('../../src/app/pixi/utils/destroyTree', () => ({ destroyTree: vi.fn() }));
vi.mock('../../src/app/pixi/backgroundTextureCache', () => ({ backgroundTextureCache: cache }));
const ui = vi.hoisted(() => ({
  app: { vault: { getAbstractFileByPath: (): null => null, adapter: { getResourcePath: (path: string): string => path } } },
  renderer: {
    getViewportInstance: (): unknown => null,
    setBackgroundSprite: () => undefined,
    // The renderer takes the sprite off the viewport (and destroys it)
    removeBackgroundSprite: (sprite: { parent: { removeChild: (child: unknown) => void } | null }) => sprite.parent?.removeChild(sprite),
    getGridSystem: (): unknown => ({}),
    initGrid: () => undefined,
  },
}));
vi.mock('../../src/app/react/root/AtlasUIContext', () => ({ useAtlasUI: () => ui }));
vi.mock('../../src/app/react/ViewStoreContext', () => {
  const store = { getState: () => ({ grid: null, remoteView: remote.on ? {} : null }) };
  return { useViewStoreHook: () => store };
});

import { BackgroundSprite } from '../../src/app/react/BackgroundSprite';

const texture = (name: string): { name: string; width: number; height: number } => ({ name, width: 100, height: 100 });

afterEach(() => {
  cleanup();
  log.length = 0;
  remote.on = false;
  vi.clearAllMocks();
});

describe('BackgroundSprite', () => {
  it("keeps a replaced object-URL map's texture until its sprite left the viewport, switching back included", async () => {
    cache.acquire.mockImplementation(async (url: string) => texture(url));
    viewport.addChild.mockImplementation((sprite: { texture: { name: string }; parent: unknown }) => {
      sprite.parent = { removeChild: () => log.push(`removed ${sprite.texture.name}`) };
      log.push(`added ${sprite.texture.name}`);
    });
    cache.release.mockImplementation((url: string) => log.push(`released ${url}`));

    ui.renderer.getViewportInstance = (): unknown => viewport;
    const view = render(<BackgroundSprite imagePath="blob:a" />);
    await act(async () => {});
    await act(async () => { view.rerender(<BackgroundSprite imagePath="blob:b" />); });
    await act(async () => {});
    await act(async () => { view.rerender(<BackgroundSprite imagePath="blob:a" />); });
    await act(async () => {});

    expect(log).toEqual([
      'added blob:a',
      // B arrived: React runs the cleanups first, A's sprite leaving before A's texture is let go.
      'removed blob:a', 'released blob:a', 'added blob:b',
      'removed blob:b', 'released blob:b', 'added blob:a',
    ]);
  });

  it('lets go of a texture that arrives after its scene was left, and of the shown one on unmount', async () => {
    let finish: (value: unknown) => void = () => undefined;
    cache.acquire.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<BackgroundSprite imagePath="blob:late" />);
    view.unmount();
    await act(async () => { finish(texture('blob:late')); });
    expect(cache.release).toHaveBeenCalledWith('blob:late');

    cache.release.mockClear();
    cache.acquire.mockImplementation(async (url: string) => texture(url));
    const shown = render(<BackgroundSprite imagePath="blob:shown" />);
    await act(async () => {});
    expect(cache.release).not.toHaveBeenCalled();
    shown.unmount();
    expect(cache.release).toHaveBeenCalledWith('blob:shown');
  });

  it('loads a remote view background by its URL, never looking for it in the vault', async () => {
    remote.on = true;
    const lookup = vi.spyOn(ui.app.vault, 'getAbstractFileByPath');
    cache.acquire.mockImplementation(async (url: string) => texture(url));
    render(<BackgroundSprite imagePath="https://example.com/map.png" />);
    await act(async () => {});
    expect(cache.acquire).toHaveBeenCalledWith('https://example.com/map.png');
    expect(lookup).not.toHaveBeenCalled();
  });
});
