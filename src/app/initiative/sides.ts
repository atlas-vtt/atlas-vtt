import { t } from '../i18n';
import { INITIATIVE_SIDES } from '../gameSystems/initiativeRules';
import type { TokenEntity } from '../types';
import type { InitiativeRules, InitiativeSide } from '../types/initiativeRulesTypes';
import type { InitiativeState } from '../types/initiativeTypes';

/** What the tracker and the players' list call a side. */
export const SIDE_LABELS: Record<InitiativeSide, string> = {
  players: t('initiative.side.players'),
  opponents: t('initiative.side.opponents'),
};

export function otherSide(side: InitiativeSide): InitiativeSide {
  return side === 'players' ? 'opponents' : 'players';
}

/** Both sides in the order they act in a round. */
export function sidesInOrder(first: InitiativeSide): [InitiativeSide, InitiativeSide] {
  return [first, otherSide(first)];
}

/**
 * Whether the tracker and the players' list group the combatants by side: a running fight
 * keeps the mode it was started in, and without a fight the collection's rules decide.
 */
export function listedBySides(initiative: Pick<InitiativeState, 'isActive' | 'sides'>, rules: InitiativeRules): boolean {
  return initiative.isActive ? initiative.sides !== undefined : rules.mode === 'sides';
}

/**
 * The side a token fights on: the one the GM gave it, else the players' for a token
 * that sees (the lighting takes those for the party), else the opponents'.
 */
export function sideOf(token: Pick<TokenEntity, 'side' | 'vision'> | undefined): InitiativeSide {
  if (token?.side && INITIATIVE_SIDES.includes(token.side)) return token.side;
  return token?.vision?.enabled ? 'players' : 'opponents';
}
