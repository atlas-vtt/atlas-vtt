import { levelBackground } from '../../levels/levelEdits';
import { hasLevels } from '../../levels/sceneLevels';
import type { SceneState } from './atlasView.ts';
import type { FloorMaps } from './assets/assetUses.ts';
import type { Floor } from './playerFloors.ts';

/**
 * The maps of a scene's floors by who looks at them: the presented floor's, those of the floors other
 * players stand on (`floors`: each connected player's), and the others'. A floor without a map names none.
 */
export function floorMaps(state: Pick<SceneState, 'levels' | 'background'>, floors: ReadonlyMap<string, Floor>, presented: Floor): FloorMaps {
  const all: Floor[] = hasLevels(state.levels) ? state.levels.map((level) => level.id) : [null];
  const watched = new Set([...floors.values()].filter((floor) => floor !== presented));
  const mapsOf = (list: readonly Floor[]): string[] => list.flatMap((floor) => levelBackground(state, floor) ?? []);
  return {
    presented: levelBackground(state, presented),
    watched: mapsOf([...watched]),
    rest: mapsOf(all.filter((floor) => floor !== presented && !watched.has(floor))),
  };
}
