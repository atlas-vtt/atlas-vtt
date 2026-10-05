import type { StoreApi } from 'zustand/vanilla';
import type { SceneSource } from '../../host/sceneSource';

/** Selects the state a renderer needs while keeping the writable store with its owner. */
export function createSceneSource<State, Slice>(
  store: Pick<StoreApi<State>, 'getState' | 'subscribe'>,
  select: (state: State) => Slice,
): SceneSource<Slice> {
  return {
    get: (): Slice => select(store.getState()),
    subscribe(listener): () => void {
      let current = select(store.getState());
      return store.subscribe(state => {
        const next = select(state);
        if (Object.is(current, next)) return;
        const previous = current;
        current = next;
        listener(next, previous);
      });
    },
  };
}
