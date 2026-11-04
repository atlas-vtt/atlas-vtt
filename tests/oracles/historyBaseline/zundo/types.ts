// zundo 2.3.0 (MIT, see LICENSE in this folder): the types of its `src/types.ts`, as its `dist/index.d.ts` declares them.
import type { StoreApi, StateCreator, StoreMutatorIdentifier } from 'zustand';

type onSave<TState> = ((pastState: TState, currentState: TState) => void) | undefined;
export interface _TemporalState<TState> {
  pastStates: Partial<TState>[];
  futureStates: Partial<TState>[];
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clear: () => void;
  isTracking: boolean;
  pause: () => void;
  resume: () => void;
  setOnSave: (onSave: onSave<TState>) => void;
  _onSave: onSave<TState>;
  _handleSet: (pastState: TState, replace: Parameters<StoreApi<TState>['setState']>[1], currentState: TState, deltaState?: Partial<TState> | null) => void;
}
export interface ZundoOptions<TState, PartialTState = TState> {
  partialize?: (state: TState) => PartialTState;
  limit?: number;
  equality?: (pastState: PartialTState, currentState: PartialTState) => boolean;
  diff?: (pastState: Partial<PartialTState>, currentState: Partial<PartialTState>) => Partial<PartialTState> | null;
  onSave?: onSave<TState>;
  handleSet?: (handleSet: StoreApi<TState>['setState']) => (pastState: Parameters<StoreApi<TState>['setState']>[0], replace: Parameters<StoreApi<TState>['setState']>[1], currentState: PartialTState, deltaState?: Partial<PartialTState> | null) => void;
  pastStates?: Partial<PartialTState>[];
  futureStates?: Partial<PartialTState>[];
  wrapTemporal?: (storeInitializer: StateCreator<_TemporalState<TState>, [
    StoreMutatorIdentifier,
    unknown
  ][], [
  ]>) => StateCreator<_TemporalState<TState>, [
    StoreMutatorIdentifier,
    unknown
  ][], [
    StoreMutatorIdentifier,
    unknown
  ][]>;
}
export type Write<T, U> = Omit<T, keyof U> & U;
export type TemporalState<TState> = Omit<_TemporalState<TState>, '_onSave' | '_handleSet'>;
