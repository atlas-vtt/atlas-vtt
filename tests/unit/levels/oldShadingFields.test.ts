// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { fakeMapRenderer } from '../../helpers/fakeMapRenderer';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { MapService } from '../../../src/app/services/MapService';
import type { RendererService } from '../../../src/app/services/RendererService';

const ONE = 'maps/crypt.atlasmap';
const FLOORS = 'maps/tower.atlasmap';
const PLAIN = 'maps/plain.atlasmap';

function sceneState(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'atlas-vtt', version: 4, background: 'maps/ground.webp',
    grid: { enabled: true, visible: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
    objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
    camera: { x: 0, y: 0, scale: 1 },
    ...extra,
  };
}

const LEVELS = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp', relief: 'maps/ground relief.png', shade: 'maps/ground shade.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp', relief: 'maps/upper relief.png' },
];

interface Harness { service: MapService; store: ViewAtlasStore; files: Map<string, string>; rendererService: RendererService }

function setup(): Harness {
  const { app, files } = createInMemoryApp({
    files: {
      [ONE]: JSON.stringify({ version: 4, state: sceneState({ mapPath: ONE, relief: 'maps/crypt relief.png', shade: 'maps/crypt shade.png' }) }),
      [FLOORS]: JSON.stringify({ version: 5, state: sceneState({ mapPath: FLOORS, version: 5, levels: LEVELS }) }),
      [PLAIN]: JSON.stringify({ version: 4, state: sceneState({ mapPath: PLAIN }) }),
      'maps/ground.webp': '', 'maps/upper.webp': '',
    },
  });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
  const store = createViewAtlasStore(app, 'old-shading-fields-test');
  const eventBus = new EventEmitter();
  eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const renderer = fakeMapRenderer(() => {});
  return { service: new MapService(app, eventBus, store), store, files, rendererService: { getRenderer: () => renderer } as unknown as RendererService };
}

async function save(store: ViewAtlasStore): Promise<void> {
  await vi.advanceTimersByTimeAsync(600);
  await store.flushStorage();
}

const saved = (h: Harness, path: string): Record<string, unknown> => (JSON.parse(h.files.get(path) ?? '{}') as { state: Record<string, unknown> }).state;

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Scenes a build with height shadows (2026-10-23) generated name a relief and a shade, which Atlas no longer reads. */
describe('a scene that names a relief and a shade', () => {
  it('of one map loads with its map and saves without them', async () => {
    const h = setup();
    await h.service.loadMap(h.rendererService, ONE);
    expect(h.store.getState()).toMatchObject({ mapLoaded: true, mapPath: ONE, background: 'maps/ground.webp' });

    h.store.getState().addToken({ x: 5, y: 5, imagePath: 'tokens/rogue.png' });
    await save(h.store);
    expect(saved(h, ONE)).not.toHaveProperty('relief');
    expect(saved(h, ONE)).not.toHaveProperty('shade');
    expect(Object.keys(saved(h, ONE).objects as Record<string, unknown>)).toContain('tokens');
  });

  it('of several floors loads every level with its map', async () => {
    const h = setup();
    await h.service.loadMap(h.rendererService, FLOORS, { centerX: 0, centerY: 0, scale: 1, level: 'upper' });
    const state = h.store.getState();
    expect(state.mapLoaded).toBe(true);
    expect(state.viewedLevel).toBe('upper');
    expect(state.levels?.map((level) => [level.id, level.background])).toEqual([['ground', 'maps/ground.webp'], ['upper', 'maps/upper.webp']]);
  });
});
