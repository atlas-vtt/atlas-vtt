/**
 * What a player character's sheet offers of its recovery buttons, and checking a request to take
 * one against it. The GM builds the offer from the character as it is now (`restOffers`), sends it
 * with the sheet, and checks every request against an offer built afresh (`checkRest`), so a player
 * can never spend more than the character holds, pick more or fewer actions than a step allows, or
 * take an action for anyone the GM did not offer. Pure.
 */

import type { RecoveryButton } from './recoveryTypes';
import { restPlan } from './restPlan';
import { alwaysRef, pickRef, type PlannedRule, type RestCharacter, type RestChoices, type RestPick, type RuleRef } from './restTypes';

/** One Spend rule as the player chooses it: how many units of `label`, 0 to `max`. */
export interface SpendOffer {
  /** The rule's place in its list (the button's rules, or its action's). */
  readonly rule: number;
  /** The source spent ("Hit Dice"). */
  readonly label: string;
  /** What one unit gives (`1d8+(2)`). */
  readonly each: string;
  readonly max: number;
}

/** An action a step offers: what it is called and says, whether it may be taken for another, and the Spend rules it asks about. */
export interface ActionOffer {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly forOthers: boolean;
  readonly spends: readonly SpendOffer[];
}

/** A step of a rest: its prompt, how many of its actions the player picks, and whether one may be picked again. */
export interface ChoiceOffer {
  readonly id: string;
  readonly prompt: string;
  readonly min: number;
  readonly max: number;
  readonly repeat: boolean;
  readonly actions: readonly ActionOffer[];
}

/** A button a character's sheet offers: its id and name, the Spend rules of its own rules, and its steps. */
export interface RestOffer {
  readonly id: string;
  readonly name: string;
  readonly spends: readonly SpendOffer[];
  readonly choices: readonly ChoiceOffer[];
}

/** An action picked in a request: its step and its id, for whom (null: oneself), and its Spend rules' units in its offer's order. */
export interface PickRequest {
  readonly choice: string;
  readonly action: string;
  readonly for: string | null;
  readonly spends: readonly number[];
}

/** A request to take a button: its id, its own Spend rules' units in the offer's order, and the actions picked. */
export interface RestRequest {
  readonly button: string;
  readonly spends: readonly number[];
  readonly picks?: readonly PickRequest[];
}

/** The Spend rules among planned rules whose reference starts with `prefix`, by their place in their list. */
function spendsOf(rules: readonly PlannedRule[], prefix: string): SpendOffer[] {
  return rules.flatMap((planned) => {
    if (!planned.spend || !planned.ref.startsWith(prefix)) return [];
    return [{ rule: Number(planned.ref.slice(prefix.length)), ...planned.spend }];
  });
}

/** What one button offers `character`: its own Spend rules, and each action's as it would be taken for the character itself. */
function restOffer(button: RecoveryButton, character: RestCharacter): RestOffer {
  const own = restPlan(button, character).rules;
  const choices = (button.choices ?? []).map((choice): ChoiceOffer => ({
    id: choice.id,
    prompt: choice.prompt,
    min: choice.min,
    max: choice.max,
    repeat: choice.repeat === true,
    actions: choice.actions.map((action): ActionOffer => {
      const picked = restPlan(button, character, [{ choice: choice.id, action: action.id, for: null }]).rules;
      return { id: action.id, name: action.name, text: action.text ?? '', forOthers: action.forOthers === true, spends: spendsOf(picked, 'pick:0:') };
    }),
  }));
  return { id: button.id, name: button.name, spends: spendsOf(own, 'always:'), choices };
}

/** The buttons `buttons` offers `character`, each with the Spend rules and steps it can plan now. */
export function restOffers(buttons: readonly RecoveryButton[], character: RestCharacter): RestOffer[] {
  return buttons.map((button) => restOffer(button, character));
}

/** Whether `units` fit `offers` one for one: as many, each a whole number from 0 to its offer's `max`. */
function spendsFit(offers: readonly SpendOffer[], units: readonly number[]): boolean {
  return units.length === offers.length && offers.every((offer, index) => {
    const spent = units[index];
    return typeof spent === 'number' && Number.isInteger(spent) && spent >= 0 && spent <= offer.max;
  });
}

/** The picks of a request as the engine takes them, or null where one names no step or action of the button, or someone not offered. */
function checkedPicks(button: RestOffer, picks: readonly PickRequest[], allies: ReadonlySet<string>): Array<{ pick: RestPick; action: ActionOffer }> | null {
  const checked: Array<{ pick: RestPick; action: ActionOffer }> = [];
  for (const pick of picks) {
    const action = button.choices.find((choice) => choice.id === pick.choice)?.actions.find((each) => each.id === pick.action);
    if (!action || !spendsFit(action.spends, pick.spends)) return null;
    if (pick.for !== null && (!action.forOthers || !allies.has(pick.for))) return null;
    checked.push({ pick: { choice: pick.choice, action: pick.action, for: pick.for }, action });
  }
  return checked;
}

/** Whether every step has as many picks as it allows, each action once unless the step repeats. */
function countsFit(button: RestOffer, picks: readonly RestPick[]): boolean {
  return button.choices.every((choice) => {
    const mine = picks.filter((pick) => pick.choice === choice.id);
    if (mine.length < choice.min || mine.length > choice.max) return false;
    return choice.repeat || new Set(mine.map((pick) => pick.action)).size === mine.length;
  });
}

/**
 * The button a request takes and the choices it makes, or null where it is refused: no offered
 * button has its id, a spend does not fit its offer, a pick names no action of the button or an
 * ally not in `allies` (or one for an action only taken for oneself), or a step gets more or fewer
 * picks than it allows.
 */
export function checkRest(offers: readonly RestOffer[], request: RestRequest, allies: ReadonlySet<string> = new Set()): { button: RestOffer; choices: RestChoices } | null {
  const button = offers.find((offer) => offer.id === request.button);
  if (!button || !spendsFit(button.spends, request.spends)) return null;
  const requested = request.picks ?? [];
  const picks = checkedPicks(button, requested, allies);
  if (!picks || !countsFit(button, picks.map((each) => each.pick))) return null;
  const spends = new Map<RuleRef, number>(button.spends.map((offer, index) => [alwaysRef(offer.rule), request.spends[index]!]));
  picks.forEach(({ action }, at) => {
    action.spends.forEach((offer, index) => spends.set(pickRef(at, offer.rule), requested[at]!.spends[index]!));
  });
  return { button, choices: { picks: picks.map((each) => each.pick), spends } };
}
