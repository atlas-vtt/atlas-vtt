import { BUILT_IN_SIDES, defaultSides, sidesOfRules } from '../gameSystems/initiativeSideRules';
import { t } from '../i18n';
import type { TokenEntity } from '../types';
import type { InitiativeRules, SideId, SideRef } from '../types/initiativeRulesTypes';
import type { InitiativeState, SidesFight } from '../types/initiativeTypes';
import { activeSides, roundTurns } from './sideOrder';

/** What the tracker and the players' list call a side: the built-in two by their translated names, a named one by its name. */
export function sideName(side: SideRef): string {
  if (side.id === 'players') return t('initiative.side.players');
  if (side.id === 'opponents') return t('initiative.side.opponents');
  return side.name ?? side.id;
}

/** Every side of a running fight in the order it acts. */
export function fightSides(fight: SidesFight): SideRef[] {
  return fight.order ?? defaultSides(fight.first);
}

/**
 * Whether the tracker and the players' list group the combatants by side: a running fight
 * keeps the mode it was started in, and without a fight the collection's rules decide.
 */
export function listedBySides(initiative: Pick<InitiativeState, 'isActive' | 'sides'>, rules: InitiativeRules): boolean {
  return initiative.isActive ? initiative.sides !== undefined : rules.mode === 'sides';
}

/** Whether the combatants show a dealt card where their number is: a running fight by cards, or the rules say cards. */
export function listedByCards(initiative: Pick<InitiativeState, 'isActive' | 'cards'>, rules: InitiativeRules): boolean {
  return initiative.isActive ? initiative.cards !== undefined : rules.mode === 'cards';
}

/**
 * The side a token fights on: the one the GM gave it where `known` holds it (the sides of the
 * fight or the rules; the built-in two by default), else the players' for a token that sees (the
 * lighting takes those for the party), else the opponents'.
 */
export function sideOf(token: Pick<TokenEntity, 'side' | 'vision'> | undefined, known: readonly SideId[] = BUILT_IN_SIDES): SideId {
  if (token?.side && known.includes(token.side)) return token.side;
  return token?.vision?.enabled ? 'players' : 'opponents';
}

/** A side as the lists show it: its name, this round's roll where the order is rolled, and whether it has the turn. */
export interface ListedSide {
  id: SideId;
  name: string;
  roll: number | null;
  active: boolean;
}

/**
 * The sides as the lists draw them, in the order they act this round: a running fight's (rolled
 * order and the side or sides with the turn), else the rules'.
 */
export function listedSides(initiative: Pick<InitiativeState, 'isActive' | 'round' | 'sides'>, rules: InitiativeRules): ListedSide[] {
  const fight = initiative.isActive ? initiative.sides : undefined;
  if (!fight) return sidesOfRules(rules).map((side) => ({ id: side.id, name: sideName(side), roll: null, active: false }));
  const refs = new Map(fightSides(fight).map((side) => [side.id, side]));
  const rolls = fight.rolls?.[initiative.round];
  const active = activeSides(fight, initiative.round);
  return roundTurns(fight, initiative.round).flat().map((id) => ({
    id,
    name: sideName(refs.get(id) ?? { id }),
    roll: rolls?.[id] ?? null,
    active: active.includes(id),
  }));
}
