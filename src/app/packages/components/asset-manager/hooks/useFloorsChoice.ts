import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChooseFloors, FloorsChoice, FloorsRequest } from '../../../../import/uvtt/runUvttGroupImport';

export interface FloorsChoiceState {
  /** What the dialog asks, while it is open. */
  request: FloorsRequest | null;
  ask: ChooseFloors;
  answer: (choice: FloorsChoice | null) => void;
}

/** What the dialog offers first: one scene, its floors in the order and with the names suggested. */
const suggested = (request: FloorsRequest): FloorsChoice => ({ kind: 'levels', sceneName: request.sceneName, floors: request.floors });

/**
 * The question an import asks about files that can be the floors of one scene, held until the
 * GM answers it in the dialog. A question asked while one is open cancels that one, and closing
 * the asset manager cancels the question it shows: an import never waits on a dialog nobody sees.
 * Files dropped before the asset manager closed, whose question comes after, are imported as
 * the dialog would have suggested.
 */
export function useFloorsChoice(isOpen: boolean): FloorsChoiceState {
  const [request, setRequest] = useState<FloorsRequest | null>(null);
  const pending = useRef<((choice: FloorsChoice | null) => void) | null>(null);
  const open = useRef(isOpen);
  open.current = isOpen;

  const answer = useCallback((choice: FloorsChoice | null): void => {
    const resolve = pending.current;
    pending.current = null;
    setRequest(null);
    resolve?.(choice);
  }, []);

  const ask = useCallback<ChooseFloors>((next) => new Promise((resolve) => {
    if (!open.current) {
      resolve(suggested(next));
      return;
    }
    pending.current?.(null);
    pending.current = resolve;
    setRequest(next);
  }), []);

  useEffect(() => { if (!isOpen) answer(null); }, [isOpen, answer]);
  useEffect(() => () => {
    open.current = false;
    pending.current?.(null);
  }, []);
  return { request, ask, answer };
}
