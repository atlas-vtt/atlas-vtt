import type { MoveWalls } from '../../../../src/app/online/movement/index.ts';
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import { getHistoryStore, runUntracked } from '../../../../src/app/stores/history';
import type { HistoryState } from '../../../../src/app/stores/history';
import type { ViewState as AtlasViewState } from '../../../../src/app/types/viewState';
import type { HeldTokens } from '../../../../src/app/types/viewUIState';
import type { StoreApi } from 'zustand';
import { PlayerMoves, type MoveState, type MoveStore } from '../../../../src/app/online/gm/playerMoves.ts';
import { token } from './shareHarness.ts';

/** The actions of Atlas's view store these tests use, besides what player moves read. */
export type ViewState = MoveState & Pick<AtlasViewState, 'objects'> & {
  setPersistenceEnabled(enabled: boolean): void;
  setIsDragging(dragging: boolean): void;
  setHeldTokens(held: HeldTokens): void;
  setSelection(ids: string[]): void;
  moveToken(id: string, x: number, y: number): void;
  setTokenPositions(positions: { id: string; x: number; y: number }[]): void;
  dropTokens(positions: { id: string; x: number; y: number }[]): void;
};
export interface ViewAtlasStore extends MoveStore {
  getState(): ViewState;
}

/** Atlas's `createViewAtlasStore`, which each test file imports by a computed path (see `STORE_FACTORY`). */
export type StoreFactory = (app: unknown, viewId: string) => ViewAtlasStore;

/**
 * Where Atlas's real view store comes from, for a computed import the type checker does not follow:
 * its module tree is the whole plugin, typed against Obsidian internals of the vendor's own.
 */
export const STORE_FACTORY = '../../../../src/app/storeFactory';

export const ANA = 'a'.repeat(20);
export const BEN = 'b'.repeat(20);
export const SCENE = 'scene-1';
/** The ids players know the tokens by. */
export const ALIAS = { ogre: '1'.repeat(24), bear: '2'.repeat(24) } as const;
const LISTED = new Map<string, string>([[ALIAS.ogre, 'ogre'], [ALIAS.bear, 'bear']]);
const OWNERS: Readonly<Record<string, string>> = { ogre: ANA, bear: BEN };

export interface Table {
  readonly store: ViewAtlasStore;
  readonly history: StoreApi<HistoryState>;
  readonly moves: PlayerMoves;
  readonly sent: { readonly body: GmMessage; readonly to: string }[];
}

/**
 * A real Atlas view store (made by `createViewAtlasStore`) with three tokens loaded and no history, and the moves of its players: Ana
 * owns the ogre, Ben the bear; their tokens stop at `walls`, none by default, and wait for their turn where `outOfTurn` says so. The clock is `Date.now` and the timers are the global ones, so fake
 * timers move both.
 */
export function table(createViewAtlasStore: StoreFactory, walls: () => MoveWalls | null = () => null, outOfTurn: (tokenId: string) => boolean = () => false): Table {
  const store = createViewAtlasStore({}, 'online-moves-test');
  store.getState().setPersistenceEnabled(false);
  runUntracked(store, () => store.setState((draft) => {
    draft.mapLoaded = true;
    draft.objects.tokens = { ogre: token('ogre', { x: 105, y: 105, layer: 0 }), bear: token('bear', { x: 315, y: 105, layer: 1 }), wolf: token('wolf', { x: 525, y: 105, layer: 2 }) };
  }));
  const history = getHistoryStore(store);
  if (history === null) throw new Error('the store has no history');
  history.getState().clear();
  const sent: Table['sent'] = [];
  const moves = new PlayerMoves(store, {
    context: () => ({ scene: SCENE, listedToken: (alias) => LISTED.get(alias), ownerOf: (id) => OWNERS[id], map: { width: 2000, height: 1500 }, walls: walls(), outOfTurn }),
    send: (body, to) => sent.push({ body, to }),
    now: () => Date.now(),
    setTimer: (run, ms) => setTimeout(run, ms) as unknown as number,
    clearTimer: (timer) => clearTimeout(timer),
  });
  moves.start();
  return { store, history, moves, sent };
}
