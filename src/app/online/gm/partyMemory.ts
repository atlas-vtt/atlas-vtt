import { levelExploredMask } from '../../levels/sceneLevels';
import type { SceneState } from './atlasView.ts';
import { maskBytes } from './exploredMaskAlpha.ts';
import type { SavedMemory } from './ExploredShare.ts';

/**
 * The explored memory the GM last saved of the floor `state` shows, with the floor's count of removals
 * (`ExploredRemovals.serial`): the party's memory. Undefined while the map loads, which clears the memory
 * before it reads the scene's: what it ends with goes once it is done.
 */
export function partyMemory(state: SceneState, serial: number): SavedMemory | undefined {
  if (!state.mapLoaded || state.isMapLoading) return undefined;
  const source = levelExploredMask(state);
  return { key: source, serial, png: () => maskBytes(source) };
}
