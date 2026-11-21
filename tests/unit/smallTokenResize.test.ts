// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { TokenResizeUI } from '../../src/app/pixi/TokenResizeUI';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => { vi.restoreAllMocks(); });

describe('resizing sub-cell tokens with handles', () => {
  it.each([['right', -35], ['left', 35]] as const)('shrinks from either %s handle into a quarter-cell and commits one undo step', (handle, delta) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'small-token-resize');
    const token: Character = { id: 't', kind: 'character', name: 'Scout', imagePath: 'scout.png', x: 35, y: 35, size: 1 };
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, tokens: { t: token } }, selectedIds: ['t'] });
    const viewport = Object.assign(new Container(), { toWorld: (point: { x: number; y: number }): { x: number; y: number } => point });
    const group = new Container();
    viewport.addChild(group);
    const ui = new TokenResizeUI(viewport as unknown as Viewport, store);
    ui.showHandles(['t'], { t: group });
    try {
      const handles = ui.getHandles();
      const chosen = handles[handle === 'left' ? 0 : 1]!;
      chosen.emit('pointerdown', { global: { x: 0, y: 0 }, stopPropagation: vi.fn() });
      viewport.emit('pointermove', { global: { x: delta, y: 0 } });
      expect(ui.getTemporarySize('t')).toBe(0.875);
      viewport.emit('pointermove', { global: { x: delta * 2, y: 0 } });
      expect(ui.getTemporarySize('t')).toBe(0.75);
      expect(store.getState().objects.tokens.t?.size).toBe(1);
      viewport.emit('pointerup', {});
      expect(ui.getTemporarySize('t')).toBeUndefined();
      expect(store.getState().objects.tokens.t).toMatchObject({ size: 0.75, x: 17.5, y: 17.5 });
      getHistoryStore(store)!.getState().undo();
      expect(store.getState().objects.tokens.t).toMatchObject({ size: 1, x: 35, y: 35 });
      getHistoryStore(store)!.getState().redo();
      expect(store.getState().objects.tokens.t).toMatchObject({ size: 0.75, x: 17.5, y: 17.5 });
    } finally { ui.destroy(); }
  });
});
