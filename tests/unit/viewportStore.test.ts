import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function setupStore(): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, 'viewport-test-view');
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/town.atlasmap');
  return store;
}

describe('Viewport store actions', () => {
  it('adds a viewport rect and returns its id', () => {
    const store = setupStore();
    const id = store.getState().addViewport({ x: 0, y: 0, width: 700, height: 400, locked: true, active: true });
    const rect = store.getState().objects.viewports[id];
    expect(rect).toMatchObject({ id, kind: 'viewport', x: 0, y: 0, width: 700, height: 400, locked: true, active: true });
  });

  it('keeps only one active viewport when adding another as active', () => {
    const store = setupStore();
    const first = store.getState().addViewport({ x: 0, y: 0, width: 700, height: 400, locked: true, active: true });
    const second = store.getState().addViewport({ x: 100, y: 100, width: 700, height: 400, locked: true, active: true });
    expect(store.getState().objects.viewports[first].active).toBe(false);
    expect(store.getState().objects.viewports[second].active).toBe(true);
  });

  it('setActiveViewport activates exactly one rect', () => {
    const store = setupStore();
    const first = store.getState().addViewport({ x: 0, y: 0, width: 700, height: 400, locked: true, active: true });
    const second = store.getState().addViewport({ x: 100, y: 100, width: 700, height: 400, locked: true, active: false });
    store.getState().setActiveViewport(second);
    expect(store.getState().objects.viewports[first].active).toBe(false);
    expect(store.getState().objects.viewports[second].active).toBe(true);
  });

  it('updateViewport deactivates other rects when activating one', () => {
    const store = setupStore();
    const first = store.getState().addViewport({ x: 0, y: 0, width: 700, height: 400, locked: true, active: true });
    const second = store.getState().addViewport({ x: 100, y: 100, width: 700, height: 400, locked: true, active: false });
    store.getState().updateViewport(second, { active: true });
    expect(store.getState().objects.viewports[first].active).toBe(false);
    expect(store.getState().objects.viewports[second].active).toBe(true);
  });

  it('deleteViewport removes the rect and clears its selection', () => {
    const store = setupStore();
    const id = store.getState().addViewport({ x: 0, y: 0, width: 700, height: 400, locked: true, active: true });
    store.getState().setSelection([id]);
    store.getState().deleteViewport(id);
    expect(store.getState().objects.viewports[id]).toBeUndefined();
    expect(store.getState().selectedIds).not.toContain(id);
  });

  it('clearMapState wipes viewports and the follow toggle', () => {
    const store = setupStore();
    store.getState().addViewport({ x: 0, y: 0, width: 700, height: 400, locked: true, active: true });
    store.getState().setFollowViewport(true);
    store.getState().clearMapState();
    expect(store.getState().objects.viewports).toEqual({});
    expect(store.getState().followViewport).toBe(false);
  });
});
