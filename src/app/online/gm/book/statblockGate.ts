import type { DiceSet } from '../../../types/diceSetTypes';
import type { PlacedTokenSource } from '../../../characters/playerCharacters';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';

/** What became of a write into a statblock note: the patches taken, those whose base the note no longer held, and why nothing was written. */
export interface StatblockWriteOutcome {
  readonly applied: readonly NotePatch[];
  readonly conflicts: readonly NotePatch[];
  readonly problem: string | null;
}

/** How the books read and write the statblock notes of the characters players play. */
export interface StatblockGate {
  /** The statblock note the library token a placed token came from links, or null for none. */
  libraryStatblock(placed: PlacedTokenSource): string | null;
  /** The note template's default dice; undefined means the campaign's dice. */
  diceSet?(path: string | undefined): DiceSet | undefined;
  /** A note's statblock as Atlas's resolver reads it now, or null where it defines none. */
  read(path: string): Promise<ResolvedStatblock | null>;
  /** Writes checked patches into a note, as every statblock edit in Atlas is written. */
  write(path: string, patches: readonly NotePatch[]): Promise<StatblockWriteOutcome>;
  /** The width of the statblock panel beside a note on this device now, which the players' cards are laid out at (`shownPanelWidth`; while no note shows, the width last measured beside one). */
  panelWidth?(): number | undefined;
  /** Calls `listener` with a note's path when its properties may read otherwise, and with null when every note may (a template changed); returns what stops it. */
  onChange(listener: (path: string | null) => void): () => void;
}

const REFUSED: StatblockWriteOutcome = { applied: [], conflicts: [], problem: 'Statblocks cannot be written now.' };

let gate: StatblockGate | null = null;
const listeners = new Set<(path: string | null) => void>();
let stopGate: (() => void) | null = null;

const tell = (path: string | null): void => {
  for (const listener of [...listeners]) listener(path);
};

/**
 * Names who reads and writes the characters' statblock notes: Atlas, through its resolver and its
 * one note writer. Without a gate no character has a statblock, and nothing is written.
 */
export function setStatblockGate(next: StatblockGate | null): void {
  stopGate?.();
  stopGate = null;
  gate = next;
  if (gate !== null && listeners.size > 0) stopGate = gate.onChange(tell);
  tell(null);
}

/** The ports the books read statblocks through, answered by the gate set now. */
export const gatedStatblocks: StatblockGate = {
  libraryStatblock: (placed) => gate?.libraryStatblock(placed) ?? null,
  diceSet: (path) => gate?.diceSet?.(path),
  panelWidth: () => gate?.panelWidth?.(),
  read: async (path) => (gate === null ? null : gate.read(path)),
  write: async (path, patches) => (gate === null ? { ...REFUSED, conflicts: patches } : gate.write(path, patches)),
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
