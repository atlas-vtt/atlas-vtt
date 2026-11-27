/**
 * Who holds the turn of a running fight, as the map's marker, the turn banner, the GM's camera and
 * online moves read it: in turn order and by cards the combatant with the turn, by sides every
 * combatant of the side (or the tied sides) with the turn that acts this round.
 */

import type { ResourceDefinition } from '../resources/resourceTypes';
import type { TokenEntity } from '../types';
import type { SideId } from '../types/initiativeRulesTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import { activeSides } from './sideOrder';
import { fightSides } from './sides';
import { entrySide, entryToken } from './party';
import { defeatedCombatants } from './defeated';

/** What an entry tells of the turn: whether the turn is at it, and whether it delayed. */
type TurnMark = Pick<InitiativeEntry, 'isActive' | 'delayed'>;
/** A turn mark that tells one combatant from another. */
type KeyedMark = TurnMark & Pick<InitiativeEntry, 'id'>;

type TurnState<E extends TurnMark = InitiativeEntry> = Pick<InitiativeState, 'isActive' | 'round' | 'sides'> & { readonly entries: readonly E[] };

/** The turn of a running fight: the combatant with it, or by sides the sides with it. */
export type CurrentTurn<E extends TurnMark = InitiativeEntry> =
  | { readonly kind: 'combatant'; readonly round: number; readonly entry: E }
  | { readonly kind: 'sides'; readonly round: number; readonly sides: readonly SideId[] };

/** Whether the turn the entry carries is its own: a combatant that delayed only keeps the turn's place. */
export function holdsTurn(entry: TurnMark): boolean {
  return entry.isActive && entry.delayed !== true;
}

/** The turn now, or null outside a fight and where nobody holds it. A delayed combatant never does. */
export function currentTurn<E extends TurnMark>(initiative: TurnState<E> | undefined): CurrentTurn<E> | null {
  if (!initiative?.isActive) return null;
  const fight = initiative.sides;
  if (fight) return { kind: 'sides', round: initiative.round, sides: activeSides(fight, initiative.round) };
  const entry = initiative.entries.find(holdsTurn);
  return entry ? { kind: 'combatant', round: initiative.round, entry } : null;
}

/** What tells one turn from the next: the round and who holds it. */
export function turnKey(turn: CurrentTurn<KeyedMark>): string {
  const holder = turn.kind === 'combatant' ? `e:${turn.entry.id}` : `s:${[...turn.sides].sort().join(',')}`;
  return `${turn.round}|${holder}`;
}

/** The key of the turn now (`turnKey`), or null where nobody holds it. */
export function currentTurnKey(initiative: TurnState<KeyedMark> | undefined): string | null {
  const turn = currentTurn(initiative);
  return turn ? turnKey(turn) : null;
}

/** The ids of the sides a running fight by sides knows, in acting order. */
export function knownSideIds(initiative: Pick<InitiativeState, 'sides'>): SideId[] {
  return initiative.sides ? fightSides(initiative.sides).map((side) => side.id) : [];
}

/**
 * The entries that hold `turn`: its combatant, or by sides each combatant on a side with the
 * turn that acts this round (neither sitting out, delayed nor among the `defeated` entry ids).
 * Tokens decide a combatant's side.
 */
export function turnEntries(
  turn: CurrentTurn | null,
  initiative: Pick<InitiativeState, 'sides'> & { readonly entries: readonly InitiativeEntry[] },
  tokens: Readonly<Record<string, TokenEntity>>,
  defeated: ReadonlySet<string>,
): InitiativeEntry[] {
  if (!turn) return [];
  if (turn.kind === 'combatant') return [turn.entry];
  const known = knownSideIds(initiative);
  return initiative.entries.filter((entry) => !entry.sitsOut && !entry.delayed && !defeated.has(entry.id)
    // A player at the table and an enemy added by name have no token, and take their side's turns
    && (entry.tokenId === undefined || entryToken(tokens, entry) !== undefined)
    && turn.sides.includes(entrySide(entry, tokens, known)));
}

/**
 * The ids of the tokens that hold the turn now: the combatant with it, or by sides every combatant
 * on a side with the turn that acts this round, which one defeated by the map's `resources` does
 * not (the card's skull). None outside a fight.
 */
export function turnHolders(
  initiative: TurnState | undefined,
  tokens: Readonly<Record<string, TokenEntity>>,
  resources: readonly ResourceDefinition[],
): string[] {
  if (!initiative) return [];
  const defeated = defeatedCombatants(initiative.entries, tokens, resources);
  return turnEntries(currentTurn(initiative), initiative, tokens, defeated).flatMap((entry) => (entry.tokenId === undefined ? [] : [entry.tokenId]));
}

/** Whether `tokenId` fights in the tracker's fight: it has an entry. */
export function inFight(initiative: Pick<InitiativeState, 'entries'> | undefined, tokenId: string): boolean {
  return initiative?.entries.some((entry) => entry.tokenId === tokenId) ?? false;
}
