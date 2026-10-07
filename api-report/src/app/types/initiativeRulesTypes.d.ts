/**
 * How a collection runs a fight in the initiative tracker.
 *
 * - `turn-order`: every combatant has a number, rolled or typed, and they act from the highest down (D&D, Pathfinder).
 * - `sides`: the players and their opponents act as two blocks, in any order within one; nothing is rolled (Cairn).
 */
export type InitiativeMode = 'turn-order' | 'sides';
export type InitiativeSide = 'players' | 'opponents';
export interface InitiativeRules {
    mode: InitiativeMode;
    /** Turn order: the dice a combatant rolls, one group `NdS` such as `1d20`. */
    roll: string;
    /** Sides: the side that acts first in every round. */
    firstSide: InitiativeSide;
}
