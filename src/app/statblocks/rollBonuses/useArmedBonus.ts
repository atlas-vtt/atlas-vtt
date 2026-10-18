import { useCallback, useSyncExternalStore } from 'react';
import type { RollBonusTarget } from './rollBonusContext';

export interface ArmedBonusState {
  armed: boolean;
  /** Arms the value for the statblock's next roll, or disarms it. */
  toggle: () => void;
}

const NOTHING = (): (() => void) => () => undefined;
const OFF = (): boolean => false;

/** Whether one value of a statblock is armed for its next roll, as every view of the statblock shows it. */
export function useArmedBonus(target: RollBonusTarget | null, id: string): ArmedBonusState {
  const store = target?.store;
  const key = target?.key;
  const subscribe = useCallback(
    (listener: () => void) => (store && key !== undefined ? store.subscribe(key, listener) : NOTHING()),
    [store, key],
  );
  const armed = useSyncExternalStore(subscribe, store && key !== undefined ? () => store.isArmed(key, id) : OFF);
  const toggle = useCallback((): void => {
    if (store && key !== undefined) store.toggle(key, id);
  }, [store, key, id]);
  return { armed, toggle };
}
