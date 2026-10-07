/** The scenes tests' vault: a collection "source" with one scene, Cave, whose map holds what a real save holds. */
import { vi } from 'vitest';
import { DisposerSet } from '../../src/api/disposers';
import { savedMapText } from '../../src/api/savedMap';
import { scenesApi } from '../../src/api/scenes';
import type { SavedMapInput, ScenesApi } from '../../src/api/types/scenes';
import type { ViewTracker } from '../../src/api/viewTracker';
import { AssetService } from '../../src/app/services/AssetService';
import { createDefaultInitiativeState } from '../../src/app/types/initiativeTypes';
import { createDefaultWidgets } from '../../src/app/storeFactory';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

export const BACKGROUND = 'atlas-vtt/assets/bg.png';
export const MAP_PATH = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';

/** A PNG header: the signature and an IHDR chunk saying 320 x 200. Only the header is read. */
export const PNG = (): ArrayBuffer => {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, 320);
  new DataView(bytes.buffer).setUint32(20, 200);
  return bytes.buffer;
};

export function emptyMap(overrides: Partial<SavedMapInput> = {}): SavedMapInput {
  return {
    background: null, grid: null, objects: { tokens: {}, texts: {}, drawings: {}, fog: {} },
    widgets: { settings: createDefaultWidgets(), values: {} }, initiative: createDefaultInitiativeState(), ...overrides,
  };
}

export interface Fixture { scenes: ScenesApi; assets: AssetService; vault: InMemoryApp; sceneId: string; mapPath: string; scope: { id: string; disposers: DisposerSet } }

export async function withScene(views: ViewTracker | null = null): Promise<Fixture> {
  AssetService.resetInstance();
  const vault = createInMemoryApp();
  vi.mocked(vault.app.vault.readBinary).mockImplementation(async (file: { path: string }) => (file.path === BACKGROUND ? PNG() : new ArrayBuffer(0)));
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('source');
  await vault.app.vault.create(BACKGROUND, 'png');
  const map = JSON.parse(savedMapText(emptyMap({ background: BACKGROUND }), MAP_PATH, 'Cave')) as { state: Record<string, unknown> };
  // What a real save also holds, and an extension never gets back
  Object.assign(map.state, { diceLog: [{ id: 'roll' }], dmNotePath: 'DM/Secret.md', exploredMask: 'mask' });
  Object.assign(map.state.objects as object, { pins: { p1: { id: 'p1', kind: 'pin', x: 5, y: 6, notePath: 'Notes/Cave entrance.md' } }, walls: { w: { id: 'w' } } });
  Object.assign(map.state, { initiativeTrackerOpen: true, camera: { x: 12, y: 34, scale: 2 }, tokenSettings: { showNameplates: true, showHPBars: false, showStressBars: true, tokenRingSize: 1.5 } });
  await vault.app.vault.create(MAP_PATH, JSON.stringify(map));
  const scene = await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP_PATH } });
  const scope = { id: 'ext', disposers: new DisposerSet() };
  return { scenes: scenesApi(vault.app, scope, views), assets, vault, sceneId: scene.id, mapPath: MAP_PATH, scope };
}

