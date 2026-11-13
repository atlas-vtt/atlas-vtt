import type { StoreApi } from 'zustand';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { PlayerDrawings, type ToldIds } from '../../../../src/app/online/gm/playerDrawings.ts';
import { parsePlayerMessage, type DrawLook, type DrawTextLook, type GmMessage, type PlayerDrawMessage, type PlayerStroke } from '../../../../src/app/online/protocol/index.ts';
import { getHistoryStore, runUntracked, type HistoryState } from '../../../../src/app/stores/history';
import type { DrawingStroke, TextElement } from '../../../../src/app/types';
import { ANA, BEN, SCENE, STORE_FACTORY } from './realStore.ts';

/** A table where players draw, for the tests of the GM's side of it: a real Atlas view store and `PlayerDrawings` on it. */

export type Request = Exclude<PlayerDrawMessage, PlayerStroke>;
export type DrawStore = SceneStore & { getState(): SceneState & { setSelection(ids: string[]): void; selectedIds: string[]; setPersistenceEnabled(enabled: boolean): void } };

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: (app: unknown, viewId: string) => DrawStore };

export const CELL = 70;
export const MAP = { width: 2000, height: 1500 };
export const LOOK: DrawLook = { colour: '#e93147', size: 'm' };
export const TEXT_LOOK: DrawTextLook = { colour: '#086ddd', size: 'l', font: 'scifi', look: 'outline', align: 'left' };

export interface Table {
  readonly store: DrawStore;
  readonly history: StoreApi<HistoryState>;
  readonly drawings: PlayerDrawings;
  readonly sent: { readonly body: GmMessage; readonly to: string }[];
  /** How often the players were to be told what is theirs. */
  changes: number;
  allowed: boolean;
  seated: Set<string>;
  now: number;
  /** How far the clock goes on each time it is read, ms: a GM whose work takes time. */
  tick: number;
  /** Hands a message to the GM as it would arrive: through the protocol's own reader. */
  send(from: string, message: Request): void;
  drawn(): DrawingStroke[];
  written(): TextElement[];
  /** What a player is told is theirs now, by the ids they name them by. */
  mine(player: string): { drawings: Record<string, string>; texts: Record<string, string> };
  refusals(): string[];
}

/** A real Atlas view store with a loaded scene and a grid of 70 px, and the players' drawings on it: Ana and Ben sit at the table, which lets players draw. */
export function table(): Table {
  const store = createViewAtlasStore({}, 'online-draw-test');
  store.getState().setPersistenceEnabled(false);
  runUntracked(store, () => store.setState((draft) => {
    draft.mapLoaded = true;
    draft.grid = { ...(draft.grid ?? {}), enabled: true, size: CELL } as SceneState['grid'];
  }));
  const history = getHistoryStore(store);
  if (history === null) throw new Error('the store has no history');
  history.getState().clear();
  const harness: Table = {
    store, history, sent: [], changes: 0, allowed: true, seated: new Set([ANA, BEN]), now: 0, tick: 0,
    drawings: new PlayerDrawings(store, {
      send: (body, to) => harness.sent.push({ body, to }),
      now: () => (harness.now += harness.tick),
      allowed: () => harness.allowed,
      seated: (player) => harness.seated.has(player),
      map: () => MAP,
      changed: () => (harness.changes += 1),
    }),
    send: (from, message) => {
      const read = parsePlayerMessage(JSON.parse(JSON.stringify(message)));
      if (read === null || read.t === 'stroke' || !read.t.startsWith('draw-')) throw new Error(`the protocol refuses ${message.t}`);
      harness.drawings.receive(from, read as Request);
    },
    drawn: () => Object.values(store.getState().objects.drawings),
    written: () => Object.values(store.getState().objects.texts),
    mine: (player) => {
      const { drawings, texts } = store.getState().objects;
      const told: ToldIds = { drawings: Object.keys(drawings), texts: Object.keys(texts) };
      const own = harness.drawings.mine(player, told);
      return {
        drawings: Object.fromEntries(own.drawings.map(({ at, id }) => [id, told.drawings[at]!])),
        texts: Object.fromEntries(own.texts.map(({ at, id }) => [id, told.texts[at]!])),
      };
    },
    refusals: () => harness.sent.flatMap(({ body }) => (body.t === 'draw-refused' ? [body.reason] : [])),
  };
  harness.drawings.setScene(SCENE);
  return harness;
}

let requests = 0;
export const next = (): number => (requests += 1);
export const flat = (points: readonly (readonly [number, number])[]): number[] => points.flat();
export const pen = (points: readonly (readonly [number, number])[], look: DrawLook = LOOK): Request => ({ t: 'draw-add', scene: SCENE, n: next(), mode: 'pen', pts: flat(points), look });
export const steps = (history: StoreApi<HistoryState>): number => history.getState().pastStates.length;
