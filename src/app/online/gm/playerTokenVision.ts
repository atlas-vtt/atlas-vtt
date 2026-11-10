import { playerVision } from '../../characters/playerVision';
import type { TokenEntity } from '../../types';
import type { SceneStore } from './atlasView.ts';
import { mapTokens, sceneTokens } from '../../tokens/offMap';

/**
 * Switches on the vision of the tokens among `ids` that become a player's now (`becomes`, asked
 * before the change), in one store write and so one undo step. A token that already sees is left
 * alone and none is switched off (`playerVision`).
 */
export function seeAsPlayers(store: SceneStore, ids: readonly string[], becomes: (id: string, token: TokenEntity) => boolean): void {
  const tokens = mapTokens(store.getState().objects);
  const seeing = ids.filter((id) => tokens[id] !== undefined && becomes(id, tokens[id]) && playerVision(tokens[id].vision) !== undefined);
  if (seeing.length === 0) return;
  store.setState((draft) => {
    for (const id of seeing) {
      const token = sceneTokens(draft.objects)[id];
      const vision = token === undefined ? undefined : playerVision(token.vision);
      if (token !== undefined && vision !== undefined) token.vision = vision;
    }
  });
}
