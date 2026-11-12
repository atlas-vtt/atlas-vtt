import type { StoreApi } from 'zustand';
import type { GridSystem } from '../grid/GridSystem';
import { levelObjects } from '../levels/levelObjects';
import { tokenStandingAt } from '../measure/tokenDistance';
import { tokenHeight, type HeightAt } from '../measure/tokenHeight';
import type { ViewAtlasState } from '../storeFactory';
import { mapTokens } from '../tokens/offMap';
import type { TokenEntity } from '../types';

type HeightsStore = Pick<StoreApi<ViewAtlasState>, 'getState' | 'subscribe'>;
type HeightsState = Pick<ViewAtlasState, 'objects' | 'levels' | 'viewedLevel'>;

const raisedOf = new WeakMap<object, readonly TokenEntity[]>();

/** The tokens of the level shown that stand off the floor; the same list for as long as the tokens' record is. */
function raisedTokens(tokens: Readonly<Record<string, TokenEntity>>): readonly TokenEntity[] {
  let raised = raisedOf.get(tokens);
  if (!raised) raisedOf.set(tokens, raised = Object.values(tokens).filter((token) => tokenHeight(token) !== 0));
  return raised;
}

const shownTokens = (state: HeightsState): Readonly<Record<string, TokenEntity>> => mapTokens(levelObjects(state));

/**
 * How high the token at a point of the level shown stands, for the rulers that start or end on
 * one: the token lying on top there, hidden ones too, where the store has it. While no token is
 * off the floor it asks nothing of them.
 */
export function measureHeightAt(store: Pick<HeightsStore, 'getState'>, grid: Pick<GridSystem, 'getOptions'>): HeightAt {
  return (point) => {
    const state = store.getState();
    const tokens = shownTokens(state);
    if (raisedTokens(tokens).length === 0) return 0;
    return tokenHeight(tokenStandingAt(point, Object.values(tokens), { ...grid.getOptions(), snapToGrid: state.grid?.snapToGrid }));
  };
}

/** What a ruler's height depends on of the tokens off the floor: where each stands, how large, how high and how deep in the pile. */
function raisedKey(tokens: readonly TokenEntity[]): string {
  return tokens.map((token) => `${token.id}:${token.x}:${token.y}:${token.size ?? 1}:${token.layer ?? 0}:${tokenHeight(token)}`).join('|');
}

/**
 * Calls `onChange` when a token off the floor rises, sinks, lands, moves or changes size, so the
 * rulers that end on it can be written again; returns what stops it. A scene whose tokens all
 * stand on the floor never calls, whatever moves.
 */
export function followTokenHeights(store: HeightsStore, onChange: () => void): () => void {
  let tokens = shownTokens(store.getState());
  let key = raisedKey(raisedTokens(tokens));
  return store.subscribe((state) => {
    const next = shownTokens(state);
    if (next === tokens) return;
    tokens = next;
    const nextKey = raisedKey(raisedTokens(next));
    if (nextKey === key) return;
    key = nextKey;
    onChange();
  });
}
