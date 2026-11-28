// Frozen from c2d0d849fbb09f316ca017a3fd2fa6bbb62274c3 src/app/pixi/playerRollTokens.ts. Only import paths are adapted.
import type { TokenEntity } from '../../../src/app/types';
import { tokenFace, type ShownRollToken } from '../../../src/app/services/playerRollSource';
import type { TokenPerception } from '../../../src/app/vision/tokenPerception';
import { seenByPlayers } from './PlayerSightTokens.ts';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { mapTokens } from '../../../src/app/tokens/offMap';

/** What of a view's store tells which scene it holds, and the tokens in it. */
export interface RollSceneState {
  mapPath: string | null;
  mapLoaded: boolean;
  isMapLoading: boolean;
  objects: { tokens: Record<string, TokenEntity> };
  tokenSettings?: { showNameplates?: boolean };
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
  const tokens = mapTokens(levelObjects(scene));
  const seen = seenByPlayers(tokens, perception());
  const shown = new Map<string, ShownRollToken>();
  for (const id of tokenIds ?? Object.keys(tokens)) {
    const token = tokens[id];
    if (!token || !sprites[id] || !seen(id)) continue;
    shown.set(id, Object.freeze({
      ...tokenFace(token),
      ...(token.showNameplate === true ? { showNameplate: true } : {}),
      mapShowsNameplates: scene.tokenSettings?.showNameplates ?? false,
    }));
  }
  return shown;
}
