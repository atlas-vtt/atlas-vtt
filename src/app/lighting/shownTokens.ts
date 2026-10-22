import type { StoreApi } from 'zustand/vanilla';
import type { TokenEntity } from '../types';
import type { ShownPlaces } from './shownPlaces';
import { sceneTokens } from '../tokens/offMap';

type Tokens = Record<string, TokenEntity>;
/** What sight and light read of a view's store. */
export type SceneStore<S> = Pick<StoreApi<S>, 'getState' | 'subscribe'>;

/** Closer than this to its place in the store, in world pixels, a token is read where the store has it. */
const SAME_PLACE = 0.25;

/** `state` with every token that glides at the place it is drawn; `state` itself while none is drawn elsewhere. */
export function withShownPlaces<S extends { objects: { tokens: Tokens } }>(state: S, shown: ShownPlaces): S {
  if (shown.size === 0) return state;
  // Only tokens on the map glide; sight and light leave out the others where they read them (`mapTokens`)
  const tokens = sceneTokens(state.objects);
  let moved: Tokens | null = null;
  for (const [id, at] of shown.entries()) {
    const token = tokens[id];
    if (token === undefined || (Math.abs(token.x - at.x) < SAME_PLACE && Math.abs(token.y - at.y) < SAME_PLACE)) continue;
    moved ??= { ...tokens };
    moved[id] = { ...token, x: at.x, y: at.y };
  }
  return moved === null ? state : { ...state, objects: { ...state.objects, tokens: moved } };
}

/**
 * The store as sight and light read it: a token that glides stands where it is drawn
 * (`withShownPlaces`), and a step of a glide is a change like any other. While no token glides it
 * reads exactly as the store does. The state read is the same object until the store or a drawn
 * place changes, so a reader that compares records works nothing out meanwhile.
 */
export function followShownPlaces<S extends { objects: { tokens: Tokens } }>(store: SceneStore<S>, shown: ShownPlaces): SceneStore<S> {
  let source: S | null = null;
  let revision = -1;
  let derived: S | null = null;
  const getState = (): S => {
    const state = store.getState();
    if (derived === null || state !== source || shown.revision !== revision) {
      source = state;
      revision = shown.revision;
      derived = withShownPlaces(state, shown);
    }
    return derived;
  };
  const subscribe = (listener: (state: S, previous: S) => void): (() => void) => {
    let previous = getState();
    const hear = (): void => {
      const next = getState();
      if (next === previous) return;
      const before = previous;
      previous = next;
      listener(next, before);
    };
    const offStore = store.subscribe(hear);
    const offShown = shown.onChange(hear);
    return (): void => {
      offStore();
      offShown();
    };
  };
  return { getState, subscribe };
}
