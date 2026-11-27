import { createContext, useContext, useEffect, useRef } from 'react';

/** The inner states of a panel that Escape undoes before it closes the panel: the latest first. */
export interface EscapeStack {
  /** Adds an undo; returns what takes it off again. */
  push(undo: () => void): () => void;
  /** Undoes the latest inner state; false when none stands, so the panel closes. */
  undo(): boolean;
}

export function escapeStack(): EscapeStack {
  const undos: (() => void)[] = [];
  return {
    push(undo) {
      undos.push(undo);
      return () => {
        const at = undos.lastIndexOf(undo);
        if (at !== -1) undos.splice(at, 1);
      };
    },
    undo() {
      const last = undos.at(-1);
      last?.();
      return last !== undefined;
    },
  };
}

export const PanelEscape = createContext<EscapeStack | null>(null);

/** While `active` (a confirm stands, a copy says it copied), Escape in the panel calls `undo` instead of closing it. */
export function useEscapeUndo(active: boolean, undo: () => void): void {
  const stack = useContext(PanelEscape);
  const latest = useRef(undo);
  useEffect(() => {
    latest.current = undo;
  });
  useEffect(() => (active && stack !== null ? stack.push(() => latest.current()) : undefined), [active, stack]);
}
