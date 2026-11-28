import type { ShownRollToken } from '../../../../src/app/services/playerRollSource';
import type { TokenEntity } from '../../../../src/app/types';
import type { Perception } from '../../../../src/app/vision/perception';
import type { GridOptions } from '../../../../src/app/grid/GridSystem';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { MapCanvas } from '../../../../src/app/online/gm/mapView.ts';
import { fakeCanvas } from './fakeAtlasTab.ts';
import { levelObjects } from '../../../../src/app/levels/levelObjects';
import { seenByPlayers } from '../../../../src/app/perception/framePerception';

/**
 * A canvas that answers as `PixiRendererOrchestrator.playerRollTokens` does for a scene whose
 * tokens are all drawn: nothing while another scene or none is loaded, else every token of the level
 * the view shows the players see (`seenByPlayers`) by `perception` (the players' frame: lighting
 * with fog; unset sees all).
 */
export function fakeTokenSource(state: () => SceneState, perception: () => ((tokenId: string) => Perception) | undefined, gridSize: () => number): MapCanvas {
  return fakeCanvas({
    playerRollTokens: (mapPath, ids) => {
      const scene = state();
      const shown = new Map<string, ShownRollToken>();
      if (scene.mapPath !== mapPath || !scene.mapLoaded || scene.isMapLoading) return shown;
      const { tokens } = levelObjects(scene);
      const seen = seenByPlayers(tokens, perception());
      for (const id of ids ?? Object.keys(tokens)) {
        const token: TokenEntity | undefined = tokens[id];
        if (token === undefined || !seen(id)) continue;
        shown.set(id, { name: token.kind === 'character' ? token.name || null : null, imagePath: token.imagePath || undefined, showRing: token.showRing !== false, ringColor: token.ringColor, mapShowsNameplates: false });
      }
      return shown;
    },
    getGridOptions: () => ({ size: gridSize() }) as GridOptions,
  });
}
