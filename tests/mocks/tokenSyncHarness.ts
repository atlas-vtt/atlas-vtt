import { EventEmitter } from 'events';
import { Application, Container, Ticker } from 'pixi.js';
import { vi } from 'vitest';
import { createInMemoryApp } from './inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createSceneSource } from '../../src/app/plugin/host/sceneSource';
import { SyncService } from '../../src/app/pixi/token-renderer/SyncService';
import type { TokenEntity } from '../../src/app/types';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';

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
  const events = new EventEmitter();
  const source = createSceneSource(store, state => ({
    tokens: state.objects.tokens, isMapLoading: state.isMapLoading, selectedIds: state.selectedIds,
  }));
  const sync = new SyncService(source, (id, x, y) => store.getState().moveToken(id, x, y), events);
  const changed = vi.fn();
  const moved = vi.fn(store.getState().moveToken);
  store.setState({ moveToken: moved });
  const ui = vi.fn();
  const controls = vi.fn();
  const ended = vi.fn();
  const pixi = new Application();
  const ticker = new Ticker();
  pixi.ticker = ticker;
  ticker.update(0);
  const sprite: TokenGroupContainer = Object.assign(new Container(), {
    tokenId: 'hero', tokenData: token(), tokenSize: 70, artPath: '', strokeWidth: 0,
  });
  sync.setPixiApp(pixi);
  sync.setTokenSpriteProvider(id => id === 'hero' ? sprite : null);
  sync.setTokensChangedCallback(changed);
  sync.setUIPositionUpdater(ui);
  sync.setControlsPositionUpdater(controls);
  sync.setAnimationEndCallback(ended);
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  return {
    sync, store, events, changed, moved, sprite, ticker, ui, controls, ended,
    replaceTokens(next: Record<string, TokenEntity>): void {
      store.setState(state => ({ objects: { ...state.objects, tokens: next } }));
    },
    tick(ms: number): void { time += ms; ticker.update(time); },
    destroy(): void { sync.destroyAll(); ticker.destroy(); sprite.destroy(); pixi.stage.destroy(); },
  };
}
