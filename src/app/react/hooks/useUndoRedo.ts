import { useCallback, useEffect, useMemo, useState } from 'react';
import { useViewStoreHook } from '../ViewStoreContext';
import { getHistoryStore } from '../../stores/history';

export interface UndoRedo {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

/** The view's undo history: whether a step back or forward is there, and taking it. */
export function useUndoRedo(): UndoRedo {
  const store = useViewStoreHook();
  const history = useMemo(() => (store ? getHistoryStore(store) : null), [store]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (!history) return undefined;
    const updateState = (): void => {
      const { pastStates, futureStates } = history.getState();
      setCanUndo(pastStates.length > 0);
      setCanRedo(futureStates.length > 0);
    };
    updateState();
    return history.subscribe(updateState);
  }, [history]);

  const undo = useCallback((): void => {
    history?.getState().undo();
  }, [history]);

  const redo = useCallback((): void => {
    history?.getState().redo();
  }, [history]);

  return { canUndo: canUndo && history !== null, canRedo: canRedo && history !== null, undo, redo };
}
