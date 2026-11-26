// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { PixiRendererOrchestrator } from '../../../../src/app/PixiRendererOrchestrator';
import { GmMarks } from '../../../../src/app/online/gm/gmMarks';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { EventEmitter } from '../../../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

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
    const listeners = new Set<() => void>();
    const renderer = tabRenderer({
      tokenRenderer: { onPlayersViewChange: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } },
      eventBus: new EventEmitter(),
    });
    const marks = new GmMarks(app, () => renderer, store, () => null, () => undefined);
    const heard = vi.fn();
    const stop = marks.source()!.onPlayersViewChange!(heard);
    for (const listener of listeners) listener();
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    for (const listener of listeners) listener();
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
