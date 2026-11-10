import { defeatedCombatants } from '../../initiative/defeated';
import { currentTurn, inFight, turnEntries } from '../../initiative/turnHolders';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import type { TokenEntity } from '../../types';
import type { InitiativeState } from '../../types/initiativeTypes';

/** What the turn's share reads of a tab's store. */
export interface TurnShareState {
  readonly initiative?: Pick<InitiativeState, 'isActive' | 'round' | 'entries' | 'sides'> | undefined;
  readonly initiativeTrackerOpen?: boolean | undefined;
  readonly objects: { readonly tokens: Readonly<Record<string, TokenEntity>> };
}

/** The tokens holding the turn of the store's fight, by sides without the combatants `definitions` call defeated. */
function holders(state: TurnShareState, definitions: readonly ResourceDefinition[]): string[] {
  const initiative = state.initiative;
  if (!initiative) return [];
  const defeated = defeatedCombatants(initiative.entries, state.objects.tokens, definitions);
  return turnEntries(currentTurn(initiative), initiative, state.objects.tokens, defeated).map((entry) => entry.tokenId);
}

/**
 * The GM ids of the tokens players are told hold the turn (the page's turn marker): those of the
 * running fight's turn (`turnEntries`), and none while players are not shown the initiative list
 * (the player view's switch off, or the GM's tracker closed). By sides a defeated combatant (by the
 * map's resource `definitions`) holds none. Which of them a player is sent at all is the token
 * list's business: only tokens they see.
 */
export function sharedTurnTokens(state: TurnShareState, showInitiative: boolean, definitions: readonly ResourceDefinition[] = []): ReadonlySet<string> {
  if (!showInitiative || state.initiativeTrackerOpen !== true) return new Set();
  return new Set(holders(state, definitions));
}

/** What decides whether players move only on their turn now. */
export interface TurnMoveRules {
  /** The GM's option: players move a token that fights only on its turn. */
  readonly movesOnTurn: boolean;
  /** The player view shows the initiative list (`showInitiative`); with the GM's tracker open, players are shown the turn. */
  readonly showInitiative: boolean;
  /** The map's resources, by which a combatant is defeated; none without. */
  readonly definitions?: readonly ResourceDefinition[];
}

/**
 * Whether a player's move of `tokenId` is refused for being out of turn, which the token list tells
 * the page as `held`: the GM chose that players move only on their turn, players are shown the
 * turn (the initiative list as `sharedInitiative` shows it: the player view's switch on and the
 * GM's tracker open; a turn nobody is shown holds nobody), a fight runs, the token fights in it
 * and does not hold the turn (by sides: its side does not, or it is defeated by the map's
 * resource `definitions`). A token outside the fight moves freely.
 */
export function movesOutOfTurn(state: TurnShareState, rules: TurnMoveRules, tokenId: string): boolean {
  if (!rules.movesOnTurn || !rules.showInitiative || state.initiativeTrackerOpen !== true) return false;
  if (!state.initiative?.isActive || !inFight(state.initiative, tokenId)) return false;
  return !holders(state, rules.definitions ?? []).includes(tokenId);
}
