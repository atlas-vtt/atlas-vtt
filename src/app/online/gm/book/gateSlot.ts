/** Who answers one question the books ask of Atlas, and says when the answer may have changed. */
export interface Gate<T> {
  read(): Promise<T>;
  onChange(listener: () => void): () => void;
}

/** The place a gate is set into: read through it, and listened to while anyone listens. */
export interface GateSlot<T> {
  /** Names who answers; null for nobody, and then the answer is `none`. Listeners hear of the change. */
  set(next: Gate<T> | null): void;
  read(): Promise<T>;
  /** Calls `listener` whenever the answer may be another, also when the gate itself changes. */
  onChange(listener: () => void): () => void;
}

/**
 * A slot for a gate: what the books may send players is answered by Atlas (the plugin sets the
 * gate), never by the files the books read. Without a gate the answer is `none`. The slot listens
 * to its gate only while someone listens to it.
 */
export function gateSlot<T>(none: T): GateSlot<T> {
  let gate: Gate<T> | null = null;
  let stopGate: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const tell = (): void => {
    for (const listener of [...listeners]) listener();
  };
  return {
    set: (next) => {
      stopGate?.();
      stopGate = null;
      gate = next;
      if (gate !== null && listeners.size > 0) stopGate = gate.onChange(tell);
      tell();
    },
    read: async () => (gate === null ? none : gate.read()),
    onChange: (listener) => {
      listeners.add(listener);
      if (gate !== null && stopGate === null) stopGate = gate.onChange(tell);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopGate?.();
        stopGate = null;
      };
    },
  };
}
