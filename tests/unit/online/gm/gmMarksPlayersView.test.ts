// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../../../src/app/PixiRendererOrchestrator';
import { GmMarks } from '../../../../src/app/online/gm/gmMarks';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../../src/app/storeFactory';
import { EventEmitter } from '../../../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

afterEach(() => vi.restoreAllMocks());

/** A map view's renderer as Atlas builds it, before its map: the GM's marks ask it by the names it answers to. */
function tabRenderer(store: ViewAtlasStore): PixiRendererOrchestrator {
  const viewport = { on: vi.fn(), off: vi.fn(), toWorld: (point: { x: number; y: number }) => point };
  const canvas = document.createElement('canvas');
  const manager = { getViewport: () => viewport, getCanvasElement: () => canvas };
  return new PixiRendererOrchestrator(createInMemoryApp().app, manager as never, new EventEmitter(), store, 'marks-tab');
}

describe('the GM\'s marks and what the players see of the shared tab', () => {
  it('hear whenever what the tab\'s canvas shows the players may have changed', () => {
    // Without its map the tab keeps no measurements yet, which the marks say once.
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = createInMemoryApp().app;
    const store = createViewAtlasStore(app, 'marks-tab');
    const renderer = tabRenderer(store);
    const marks = new GmMarks(app, () => renderer, store, () => null, () => undefined);
    const heard = vi.fn();
    const stop = marks.source()!.onPlayersViewChange!(heard);
    store.getState().setGMView(false);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    store.getState().setGMView(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
