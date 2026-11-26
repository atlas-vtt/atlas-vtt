/**
 * Token Sync Service
 *
 * Hands the token renderer every change of the tokens it draws, and holds those a map load makes
 * until the load is done.
 */

import type { TokenEntity } from '../../types';
import type { SceneSource } from '../../host/sceneSource';
import type { TokenSyncState } from './tokenSyncState';


export class SyncService {
  private source: SceneSource<TokenSyncState>;
  private pendingTokenSync: { newTokens: Record<string, TokenEntity>; prevTokens: Record<string, TokenEntity> } | null = null;
  private unsubscribeFromSource?: () => void;
  private onTokensChanged?: (tokens: Record<string, TokenEntity>, prevTokens: Record<string, TokenEntity>) => void;

  constructor(source: SceneSource<TokenSyncState>) {
    this.source = source;
  }

  initialize(): void {
    this.unsubscribeFromSource = this.source.subscribe((state, prevState) => {
      const newTokens = state.tokens;
      const prevTokens = prevState.tokens;

      if (newTokens !== prevTokens) {
        const isMapLoading = state.isMapLoading;

        if (isMapLoading) {
          this.pendingTokenSync = { newTokens, prevTokens };
        } else {
          this.onTokensChanged?.(newTokens, prevTokens);
        }
      } else if (prevState.isMapLoading && !state.isMapLoading && this.pendingTokenSync) {
        // A load that ends without `map-loaded` (a scene that could not be opened) forces nothing:
        // the tokens of the scene before would stay on the canvas
        this.forceSyncTokens();
      }
    });

    // Fire immediately with current tokens (replaces subscribeWithSelector's fireImmediately option)
    const currentTokens = this.source.get().tokens;
    if (Object.keys(currentTokens).length > 0) {
      this.onTokensChanged?.(currentTokens, {});
    }
  }

  forceSyncTokens(): void {
    if (this.pendingTokenSync) {
      this.onTokensChanged?.(this.pendingTokenSync.newTokens, this.pendingTokenSync.prevTokens);
      this.pendingTokenSync = null;
    } else {
      const tokens = this.source.get().tokens;
      this.onTokensChanged?.(tokens, {});
    }
  }

  setTokensChangedCallback(callback: (tokens: Record<string, TokenEntity>, prevTokens: Record<string, TokenEntity>) => void): void {
    this.onTokensChanged = callback;
  }

  destroyAll(): void {
    this.unsubscribeFromSource?.();
    this.pendingTokenSync = null;
  }
}
