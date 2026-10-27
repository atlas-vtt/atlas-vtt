import type { SceneState, SceneStore } from './atlasView.ts';
import { hasLevels, resolveLevel } from '../../levels/sceneLevels';

/**
 * The shared store as the players on one floor see it: the scene with that floor shown
 * (`viewedLevel`), so everything that reads the level a view shows (`levelObjects`, the floor's map,
 * explored memory and fog) reads this floor, whichever floor the GM looks at. Writes go to the store
 * itself, as the GM's own. A scene without levels, or the floor the GM's view shows, is the store's
 * state itself; another floor is a copy made once per state, so readers that compare by identity see
 * a change only when the store changes.
 */
export class FloorStore implements SceneStore {
  private readonly pinned = new WeakMap<SceneState, SceneState>();

  /** `level`: the floor's level id; null is the first (and a scene's only) floor. */
  constructor(private readonly real: SceneStore, readonly level: string | null) {}

  /** Atlas's history of the store, so that player drags stay one undo step. */
  get temporal(): unknown {
    return (this.real as { temporal?: unknown }).temporal;
  }

  getState(): SceneState {
    return this.onFloor(this.real.getState());
  }

  setState(recipe: (draft: SceneState) => void): void {
    this.real.setState(recipe);
  }

  subscribe(listener: (state: SceneState) => void): () => void {
    return this.real.subscribe((state) => listener(this.onFloor(state)));
  }

  /** `state` with this floor shown. */
  onFloor(state: SceneState): SceneState {
    if (!hasLevels(state.levels)) return state;
    const level = resolveLevel(state.levels, this.level);
    if (resolveLevel(state.levels, state.viewedLevel) === level) return state;
    let pinned = this.pinned.get(state);
    if (pinned === undefined) {
      pinned = { ...state, viewedLevel: level ?? undefined };
      this.pinned.set(state, pinned);
    }
    return pinned;
  }
}
