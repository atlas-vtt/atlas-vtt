import type { TokenEntity } from '../types';
import type { ShownRollToken } from '../services/playerRollSource';
import type { TokenPerception } from './lighting/playerLightingLayers';
import { tokenDisplayName } from './token-renderer/tokenDisplayName';

/** What of a view's store tells which scene it holds, and the tokens in it. */
export interface RollSceneState {
  mapPath: string | null;
  mapLoaded: boolean;
  isMapLoading: boolean;
  objects: { tokens: Record<string, TokenEntity> };
}

const NONE: ReadonlyMap<string, ShownRollToken> = new Map();

/**
 * The tokens a players' frame of `mapPath` shows, among `tokenIds` (all without): drawn,
 * not hidden, and seen by `perception`, the frame's own (lighting with committed fog).
 * Nothing while the store holds another scene or none loaded; `perception` is asked only
 * once the scene is the one asked about.
 */
export function shownRollTokens(
  scene: RollSceneState,
  mapPath: string,
  sprites: Readonly<Record<string, object | null>>,
  perception: () => TokenPerception | undefined,
  tokenIds?: readonly string[],
): ReadonlyMap<string, ShownRollToken> {
  if (scene.mapPath !== mapPath || !scene.mapLoaded || scene.isMapLoading) return NONE;
  const tokens = scene.objects.tokens;
  const perceives = perception();
  const shown = new Map<string, ShownRollToken>();
  for (const id of tokenIds ?? Object.keys(tokens)) {
    const token = tokens[id];
    if (!token || token.isHidden || !sprites[id] || (perceives?.(id) ?? 'seen') !== 'seen') continue;
    shown.set(id, Object.freeze({
      name: tokenDisplayName(token),
      imagePath: token.imagePath || undefined,
      showRing: token.showRing !== false,
      ringColor: token.ringColor,
    }));
  }
  return shown;
}
