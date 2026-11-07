/**
 * Who holds the turn of a running fight, as the map's marker, the turn banner, the GM's camera and
 * online moves read it: in turn order and by cards the combatant with the turn, by sides every
 * combatant of the side (or the tied sides) with the turn that acts this round.
 */

import type { TokenEntity } from '../types';
import type { SideId } from '../types/initiativeRulesTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { activeSides } from './sideOrder';
import { fightSides, sideOf } from './sides';

type TurnState = Pick<InitiativeState, 'isActive' | 'round' | 'entries' | 'sides'>;

/** The turn of a running fight: the combatant with it, or by sides the sides with it. */
export type CurrentTurn =
  | { readonly kind: 'combatant'; readonly round: number; readonly entry: InitiativeEntry }
  | { readonly kind: 'sides'; readonly round: number; readonly sides: readonly SideId[] };

/** The turn now, or null outside a fight and where nobody holds it. A delayed combatant never does. */
export function currentTurn(initiative: TurnState | undefined): CurrentTurn | null {
  if (!initiative?.isActive) return null;
  const fight = initiative.sides;
  if (fight) return { kind: 'sides', round: initiative.round, sides: activeSides(fight, initiative.round) };
  const entry = initiative.entries.find((candidate) => candidate.isActive && !candidate.delayed);
  return entry ? { kind: 'combatant', round: initiative.round, entry } : null;
}

/** What tells one turn from the next: the round and who holds it. */
export function turnKey(turn: CurrentTurn): string {
  const holder = turn.kind === 'combatant' ? `e:${turn.entry.id}` : `s:${[...turn.sides].sort().join(',')}`;
  return `${turn.round}|${holder}`;
}

/** The ids of the sides a running fight by sides knows, in acting order. */
export function knownSideIds(initiative: Pick<InitiativeState, 'sides'>): SideId[] {
  return initiative.sides ? fightSides(initiative.sides).map((side) => side.id) : [];
}

/** Nobody is defeated: what a caller passes that cannot tell. */
const NOBODY: ReadonlySet<string> = new Set();

/**
 * The entries that hold `turn`: its combatant, or by sides each combatant on a side with the
 * turn that acts this round (neither sitting out, delayed nor among the `defeated` entry ids, as
 * `defeatedCombatants` reads them). Tokens decide a combatant's side.
 */
export function turnEntries(
  turn: CurrentTurn | null,
  initiative: Pick<InitiativeState, 'entries' | 'sides'>,
  tokens: Readonly<Record<string, TokenEntity>>,
  defeated: ReadonlySet<string> = NOBODY,
): InitiativeEntry[] {
  if (!turn) return [];
  if (turn.kind === 'combatant') return [turn.entry];
  const known = knownSideIds(initiative);
  return initiative.entries.filter((entry) => !entry.sitsOut && !entry.delayed && !defeated.has(entry.id) && tokens[entry.tokenId] !== undefined
    && turn.sides.includes(sideOf(tokens[entry.tokenId], known)));
}

/** The ids of the tokens that hold the turn now (by sides without the `defeated` entries); none outside a fight. */
export function turnTokenIds(initiative: TurnState | undefined, tokens: Readonly<Record<string, TokenEntity>>, defeated: ReadonlySet<string> = NOBODY): string[] {
  if (!initiative) return [];
  return turnEntries(currentTurn(initiative), initiative, tokens, defeated).map((entry) => entry.tokenId);
}

/** Whether `tokenId` fights in the tracker's fight: it has an entry. */
export function inFight(initiative: Pick<InitiativeState, 'entries'> | undefined, tokenId: string): boolean {
  return initiative?.entries.some((entry) => entry.tokenId === tokenId) ?? false;
}
