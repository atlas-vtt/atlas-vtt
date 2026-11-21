// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Platform, type App } from 'obsidian';
import { desktopOnly, isDesktopApp } from '../../../src/app/platform/desktopOnly';
import { nativeFolderPicker, systemTrash } from '../../../src/app/services/electronRemote';
import { openPlayerWindow } from '../../../src/app/services/PlayerWindowPresenter';
import { PlayerWindowService } from '../../../src/app/services/PlayerWindowService';
import { nodeFilesOf } from '../../../src/app/soundLibrary/nodeFiles';

const scene = { tabId: 'scene-a', filePath: 'scene-a.atlasmap' };

/** A workspace that has no player window yet and hands out a popout leaf when asked. */
function workspaceApp(): { app: App; openPopoutLeaf: ReturnType<typeof vi.fn>; setViewState: ReturnType<typeof vi.fn> } {
  const setViewState = vi.fn(() => Promise.resolve());
  const openPopoutLeaf = vi.fn(() => ({ setViewState, view: null }));
  const app = { workspace: { getLeavesOfType: () => [], openPopoutLeaf } };
  return { app: app as unknown as App, openPopoutLeaf, setViewState };
}

/** An app nothing may be asked of. */
const untouchable = new Proxy({}, { get: (_target, key) => { throw new Error(`The app was asked for ${String(key)}`); } }) as App;

/** A window whose Electron and Node answer every question, as the desktop app's does. */
function electronWindow(): Window {
  const shell = { trashItem: () => Promise.resolve() };
  const remote = { shell, dialog: { showOpenDialog: () => Promise.resolve({ canceled: true }) }, getCurrentWindow: () => ({}) };
  const modules: Record<string, unknown> = { electron: { remote, shell }, fs: { promises: {} }, path: { sep: '/' }, os: { homedir: () => '/home/gm' } };
  return { require: (name: string): unknown => modules[name] ?? null } as unknown as Window;
}

afterEach(() => {
  Platform.isMobile = false;
  Platform.isDesktopApp = true;
});

describe('what only the desktop app offers', () => {
  it('is offered in the desktop app', () => {
    expect(isDesktopApp()).toBe(true);
    expect(desktopOnly('reveal', 'open')).toEqual(['reveal', 'open']);
  });

  it('is not offered in the mobile app', () => {
    Platform.isMobile = true;
    Platform.isDesktopApp = false;
    expect(isDesktopApp()).toBe(false);
    expect(desktopOnly('reveal', 'open')).toEqual([]);
  });

  it('is not offered by a desktop Obsidian that emulates mobile, so it shows what a tablet shows', () => {
    Platform.isMobile = true;
    expect(isDesktopApp()).toBe(false);
    expect(desktopOnly('reveal')).toEqual([]);
  });
});

describe('the player window', () => {
  it('opens in a popout on the desktop', async () => {
    const { app, openPopoutLeaf, setViewState } = workspaceApp();
    await PlayerWindowService.openLeaf(app, scene);
    expect(openPopoutLeaf).toHaveBeenCalledOnce();
    expect(setViewState).toHaveBeenCalledOnce();
  });

  it('never asks for a popout on mobile, where there is none', async () => {
    Platform.isMobile = true;
    const { app, openPopoutLeaf } = workspaceApp();
    await expect(PlayerWindowService.openLeaf(app, scene)).resolves.toBeNull();
    expect(openPopoutLeaf).not.toHaveBeenCalled();
  });

  it('is not opened on mobile, and nothing is presented for it', async () => {
    Platform.isMobile = true;
    await expect(openPlayerWindow(untouchable)).resolves.toBeUndefined();
  });
});

describe('Electron and Node', () => {
  it('are reached in the desktop app', () => {
    const win = electronWindow();
    expect(systemTrash(win)).toBeTypeOf('function');
    expect(nativeFolderPicker(win)).toBeTypeOf('function');
    expect(nodeFilesOf(win)).not.toBeNull();
  });

  it('are never reached on mobile, even where they would answer', () => {
    Platform.isMobile = true;
    const win = electronWindow();
    expect(systemTrash(win)).toBeNull();
    expect(nativeFolderPicker(win)).toBeNull();
    expect(nodeFilesOf(win)).toBeNull();
  });
});
