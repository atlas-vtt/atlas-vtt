import type { TokenEntity } from '../types';
import type { InitiativeEntry } from '../types/initiativeTypes';
import { listSegments, type ListSegment } from './listSegments';
import type { ListedSide } from './sides';
import { entrySide } from './party';

/** What the GM's tracker draws its list by. */
export interface TrackerListOptions {
  bySides: boolean;
  /** The sides in the order they act this round (`listedSides`). */
  sides: readonly ListedSide[];
  fightRuns: boolean;
  /** The entry of the combatant whose turn it is (`currentTurn`); none by sides and outside a fight. */
  holder?: string | undefined;
  round: number;
  /** The GM's choice: the list starts at the turn during a fight. */
  fromTurn: boolean;
}

/**
 * The GM's tracker list (`listSegments`) of `entries` in turn order: every side, also one
 * without combatants; in turn order the list turns at the combatant whose turn it is.
 */
export function trackerSegments(
  entries: readonly InitiativeEntry[],
  tokens: Readonly<Record<string, TokenEntity>>,
  options: TrackerListOptions,
): ListSegment<InitiativeEntry>[] {
  const known = options.sides.map((side) => side.id);
  return listSegments(entries, {
    bySides: options.bySides,
    sides: options.sides,
    sideOf: (entry) => entrySide(entry, tokens, known),
    delayed: (entry) => entry.delayed === true,
    fightRuns: options.fightRuns,
    round: options.round,
    turnAt: options.holder === undefined ? -1 : entries.filter((entry) => !entry.delayed).findIndex((entry) => entry.id === options.holder),
    fromTurn: options.fromTurn,
    emptySides: true,
  });
}
