import type { AtlasView } from '../atlas-view';
import type { PixiRendererOrchestrator } from '../PixiRendererOrchestrator';
import type { PlayerBadgeNumbers } from '../pixi/token-renderer/PlayerBadgeNumbers';
import type { EventEmitter } from '../utils/typedEmitter';
import type { PlayerRollSources } from './playerRollSource';

/** What the players' overlays (initiative list, dice rolls) read of the view that shows them its scene. */
export interface PlayerOverlaySources {
  diceEvents: EventEmitter;
  /** Which tokens the players' picture shows, for rolls to name; none while the view holds no scene. */
  rollSources?: PlayerRollSources;
  badgeNumbers?: PlayerBadgeNumbers;
}

/**
 * The overlay sources of `view` as it draws through `renderer`, for the scene it shows now: rolls
 * are named by what its players' picture shows of that scene, never by a later one.
 */
export function playerOverlaySources(view: AtlasView, renderer: PixiRendererOrchestrator): PlayerOverlaySources {
  const mapPath = view.atlasStore.getState().mapPath;
  const badgeNumbers = renderer.playerBadgeNumbers();
  return {
    diceEvents: view.serviceManager.getEventBus(),
    ...(mapPath ? {
      rollSources: { viewId: view.viewId, mapPath, shownTokens: (tokenIds) => renderer.playerRollTokens(mapPath, tokenIds) },
    } : {}),
    ...(badgeNumbers ? { badgeNumbers } : {}),
  };
}
