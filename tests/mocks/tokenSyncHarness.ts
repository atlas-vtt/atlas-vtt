import { vi } from 'vitest';
import { createInMemoryApp } from './inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createSceneSource } from '../../src/app/plugin/host/sceneSource';
import { SyncService } from '../../src/app/pixi/token-renderer/SyncService';
import type { TokenEntity } from '../../src/app/types';

export function token(x = 0, y = 0): TokenEntity {
  return { id: 'hero', kind: 'token', x, y, size: 1, imagePath: '', layer: 0, isHidden: false, rotation: 0 };
}

export function tokenSyncHarness(tokens: Record<string, TokenEntity> = {}): ReturnType<typeof setup> {
  return setup(tokens);
}

function setup(tokens: Record<string, TokenEntity>) {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'token-sync-test');
  store.getState().setPersistenceEnabled(false);
  store.setState(state => ({ objects: { ...state.objects, tokens } }));
  const source = createSceneSource(store, state => ({ tokens: state.objects.tokens, isMapLoading: state.isMapLoading }));
  const sync = new SyncService(source);
  const changed = vi.fn();
  sync.setTokensChangedCallback(changed);
  return {
    sync, store, changed,
    replaceTokens(next: Record<string, TokenEntity>): void {
      store.setState(state => ({ objects: { ...state.objects, tokens: next } }));
    },
    destroy(): void { sync.destroyAll(); },
  };
}
