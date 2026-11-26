// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../../../src/app/PixiRendererOrchestrator';
import { GmMarks } from '../../../../src/app/online/gm/gmMarks';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { viewAudience } from '../../../helpers/viewAudience';

/** A map view's renderer as far as the GM's marks read it: its own prototype, so they ask it by the names it answers to. */
function tabRenderer(fields: Record<string, unknown>): PixiRendererOrchestrator {
  const viewport = { on: vi.fn(), off: vi.fn(), toWorld: (point: { x: number; y: number }) => point };
  const canvas = document.createElement('canvas');
  return Object.assign(Object.create(PixiRendererOrchestrator.prototype) as PixiRendererOrchestrator, {
    pixiAppManager: { getViewport: () => viewport, getCanvasElement: () => canvas },
    measureRenderer: { measurements: { get: () => ({}), subscribe: () => () => undefined } },
    ...fields,
  });
}

describe('the GM\'s marks and what the players see of the shared tab', () => {
  it('hear whenever what the tab\'s canvas shows the players may have changed', () => {
    const app = createInMemoryApp().app;
    const store = createViewAtlasStore(app, 'marks-tab');
    const renderer = tabRenderer({ audience: viewAudience(store).audience });
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
