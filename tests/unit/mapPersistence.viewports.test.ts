import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createAtlasStorage } from '../../src/app/services/MapPersistence';

const MAP_PATH = 'maps/cave.atlasmap';

function createStorage(saved: unknown): ReturnType<typeof createAtlasStorage> {
  const { app } = createInMemoryApp({ files: { [MAP_PATH]: JSON.stringify(saved) } });
  app.vault.getFileByPath = app.vault.getAbstractFileByPath;
  return createAtlasStorage(app, { getState: () => ({ mapPath: MAP_PATH }) });
}

afterEach(() => vi.restoreAllMocks());

describe('TV viewports in a map file', () => {
  it('opens a map from before TV viewports with none, and with the players following the DM', async () => {
    const storage = createStorage({ version: 4, state: { version: 4, mapPath: MAP_PATH, objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} } } });

    const loaded = await storage.getItem('atlas');

    expect(loaded?.state).toMatchObject({ followViewport: false, objects: { viewports: {} } });
  });

  it('keeps the viewports and the follow setting a map was saved with', async () => {
    const viewport = { id: 'tv', kind: 'viewport', x: 10, y: 20, width: 300, height: 200, locked: false, active: true };
    const storage = createStorage({ version: 4, state: { version: 4, mapPath: MAP_PATH, followViewport: true, objects: { tokens: {}, viewports: { tv: viewport } } } });

    const loaded = await storage.getItem('atlas');

    expect(loaded?.state).toMatchObject({ followViewport: true, objects: { viewports: { tv: viewport } } });
  });

  it('does not make the map look newer than the Atlas that wrote it', async () => {
    const storage = createStorage({ version: 4, state: { version: 4, mapPath: MAP_PATH, objects: { tokens: {} } } });

    const loaded = await storage.getItem('atlas');

    expect(loaded?.version).toBe(4);
  });
});
