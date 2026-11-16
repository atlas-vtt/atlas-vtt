import type { SceneSound } from '../sound/soundTypes';

/** What a fight's owner needs of a view's store. */
export interface FightStore {
  getState(): FightState;
  subscribe(listener: (state: FightState, previous: FightState) => void): () => void;
}

export interface FightState {
  mapPath: string | null;
  isMapLoading: boolean;
  sound: SceneSound | null;
  initiative?: { isActive?: boolean };
}

export interface FightEvents {
  started(scenePath: string, sound: SceneSound | null): void;
  ended(scenePath: string): void;
}

/**
 * Hears a fight start and end in a view's store, on the write that does it. A load rewrites the store in
 * steps and may bring a fight saved with its scene: nobody started that one.
 */
export function watchFights(store: FightStore, events: FightEvents): () => void {
  return store.subscribe((state, previous) => {
    const active = state.initiative?.isActive === true;
    if (active === (previous.initiative?.isActive === true)) return;
    if (state.isMapLoading || previous.isMapLoading || state.mapPath !== previous.mapPath || !state.mapPath) return;
    if (active) events.started(state.mapPath, state.sound);
    else events.ended(state.mapPath);
  });
}
