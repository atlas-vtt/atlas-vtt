import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceLeaf } from 'obsidian';
import { LocalPlayerView } from '../../src/app/local-player-view';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { createStore } from 'zustand/vanilla';
import { SettingsService } from '../../src/app/services/SettingsService';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { frameSource, sizePlayerWindow } from '../mocks/playerFrameSource';

vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ restorePlayerWindow: vi.fn() }));

afterEach(() => { PlayerWindowService.getInstance()?.destroy(false); vi.useRealTimers(); vi.restoreAllMocks(); });

function createView(): LocalPlayerView {
  const leaf = new WorkspaceLeaf();
  leaf.app = { workspace: { requestSaveLayout: vi.fn(), onLayoutReady: vi.fn(), on: vi.fn(() => ({})), offref: vi.fn() } };
  return new LocalPlayerView(leaf);
}

describe('restorable local player view', () => {
  it('round-trips the presented scene and manual pause through workspace state', async () => {
    const original = createView();
    original.updateSession({ tabId: 'tavern', filePath: 'maps/tavern.atlasmap', frozen: true, camera: { centerX: 100, centerY: 200, scale: 1.5 } });
    const restored = createView();
    await restored.setState(JSON.parse(JSON.stringify(original.getState())), {});
    expect(restored.getState()).toEqual(original.getState());
    await restored.setState({ tabId: 42, filePath: null }, {});
    expect(restored.getState()).toEqual(original.getState());
  });

  it('preserves the popout workspace and window when unloading the plugin', async () => {
    vi.useFakeTimers();
    const view = createView();
    const doc = document.implementation.createHTMLDocument();
    Object.defineProperty(doc, 'readyState', { value: 'complete' });
    const chrome = doc.body.createDiv({ cls: 'workspace' });
    chrome.append(view.contentEl);
    const popout = {
      document: doc, closed: false, close: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    };
    Object.defineProperty(view.contentEl, 'win', { value: popout });
    const settings = new SettingsService(view.app);
    const service = new PlayerWindowService(view.app, createStore(() => ({})) as ReturnType<typeof createStore<ViewAtlasState>>, settings);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), drawImage } as never);
    sizePlayerWindow();
    service.attachToView(view, frameSource(), { tabId: 'tavern', filePath: 'tavern.atlasmap' });
    expect(doc.body.contains(chrome)).toBe(true);
    expect(chrome.querySelector('#atlas-player-canvas')).not.toBeNull();
    expect(drawImage).toHaveBeenCalledTimes(1);
    service.destroy(false);
    expect(popout.close).not.toHaveBeenCalled();
    expect(popout.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(PlayerWindowService.getInstance()).toBeNull();
  });
});
