import type { ShownRollToken } from '../../../../src/app/services/playerRollSource';
import type { TokenEntity } from '../../../../src/app/types';
import type { Perception } from '../../../../src/app/vision/perception';
import type { PlayerTokenSource, SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { levelObjects } from '../../../../src/app/levels/levelObjects';

/**
 * A renderer that answers as `PixiRendererOrchestrator.playerRollTokens` does for a scene whose
 * tokens are all drawn: nothing while another scene or none is loaded, else every token of the level
 * the view shows that is not
 * hidden and that `perception` (the players' frame: lighting with fog; unset sees all) sees.
 * The vendor's own function cannot be type checked here without the whole plugin.
 */
export function fakeTokenSource(state: () => SceneState, perception: () => ((tokenId: string) => Perception) | undefined, gridSize: () => number): PlayerTokenSource {
  return {
    playerRollTokens: (mapPath, ids) => {
      const scene = state();
      const shown = new Map<string, ShownRollToken>();
      if (scene.mapPath !== mapPath || !scene.mapLoaded || scene.isMapLoading) return shown;
      const sees = perception();
      const { tokens } = levelObjects(scene);
      for (const id of ids ?? Object.keys(tokens)) {
        const token: TokenEntity | undefined = tokens[id];
        if (token === undefined || token.isHidden === true || (sees?.(id) ?? 'seen') !== 'seen') continue;
        shown.set(id, { name: token.kind === 'character' ? token.name || null : null, imagePath: token.imagePath || undefined, showRing: token.showRing !== false, ringColor: token.ringColor });
      }
      return shown;
    },
    getGridOptions: () => ({ size: gridSize() }),
  };
}
