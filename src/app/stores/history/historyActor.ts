/** Who a write to the store comes from: the GM, or Atlas itself (`untracked`). Only the GM's writes become undo steps. */
export type HistoryActor = { readonly kind: 'gm' } | { readonly kind: 'system' };

const GM: HistoryActor = Object.freeze({ kind: 'gm' });
const SYSTEM: HistoryActor = Object.freeze({ kind: 'system' });

/** Who writes to one store right now. Each store keeps its own, since writes to one store nest inside another's. */
export interface Attribution {
  current(): HistoryActor;
  /** Runs `fn` as Atlas itself; nestable. */
  asSystem<T>(fn: () => T): T;
}

export function createAttribution(): Attribution {
  let systemDepth = 0;
  return {
    current: () => (systemDepth > 0 ? SYSTEM : GM),
    asSystem: (fn) => {
      systemDepth += 1;
      try {
        return fn();
      } finally {
        systemDepth -= 1;
      }
    },
  };
}
