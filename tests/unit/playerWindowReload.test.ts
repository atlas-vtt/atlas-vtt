// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { registerPlayerWindowReloadCleanup } from '../../src/app/plugin/playerWindowReload';
import { LOCAL_PLAYER_VIEW_TYPE } from '../../src/app/local-player-view';

describe('registerPlayerWindowReloadCleanup', () => {
  it('closes player popouts when the main window unloads, but never the main window', () => {
    const popout = { close: vi.fn() };
    const main = window;
    const leaves = [
      { view: { containerEl: { win: popout } } },
      { view: { containerEl: { win: main } } },
    ];
    const handlers: Array<() => void> = [];
    const plugin = {
      app: { workspace: { getLeavesOfType: vi.fn((type: string) => (type === LOCAL_PLAYER_VIEW_TYPE ? leaves : [])) } },
      registerDomEvent: vi.fn((target: Window, event: string, handler: () => void) => {
        if (target === window && event === 'pagehide') handlers.push(handler);
      }),
    } as unknown as Plugin;
    const closeMain = vi.spyOn(window, 'close').mockImplementation(() => undefined);

    registerPlayerWindowReloadCleanup(plugin);
    expect(popout.close).not.toHaveBeenCalled();
    handlers.forEach((handler) => handler());

    expect(popout.close).toHaveBeenCalledTimes(1);
    expect(closeMain).not.toHaveBeenCalled();
    closeMain.mockRestore();
  });
});
