/**
 * A set's dice as the lab's tray shows them: one by one. A set stores groups
 * ("2d6 named Moon in purple"); the tray shows each die of a group as a die of
 * its own, so one of them can be changed alone, and the dice are grouped again
 * on the way back: dice next to each other with the same sides, name and colour
 * are one group.
 */

import { MAX_SET_DICE, MAX_SET_GROUPS } from '../../../../gameSystems/diceSets';
import { cleanDiceName } from '../../../../gameSystems/diceSetValidation';
import type { AdvantageRule, AdvantageSide, DiceSetDie } from '../../../../types/diceSetTypes';

export interface LabDie {
  /** Stays while the lab is open: the die's place on the tray, its focus and its fan follow it. */
  id: string;
  sides: number;
  /** As typed; blank for a die without a name. */
  name: string;
  colour?: string | undefined;
}

/** What a die may change of itself in the lab. */
export type DieChange = Partial<Pick<LabDie, 'sides' | 'name' | 'colour'>>;

/** Which of a set's limits dice break: more dice than a set rolls, or more groups than it holds. */
export type DiceLimit = 'dice' | 'groups';

/** The sides a die is offered with first; any other from 2 to 999 can be typed. */
export const COMMON_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

/** The die the first + of an empty set adds. */
const FIRST_SIDES = 20;

let serial = 0;

/** An id no die of this window has had. */
export function newDieId(): string {
  serial += 1;
  return `die-${serial}`;
}

/** A group's dice, one each. */
export function diceOfGroups(groups: readonly DiceSetDie[]): LabDie[] {
  return groups.flatMap((group) => Array.from({ length: group.count }, (): LabDie => ({
    id: newDieId(),
    sides: group.sides,
    name: group.name ?? '',
    ...(group.colour !== undefined && { colour: group.colour }),
  })));
}

/** Whether two dice would be one group: the same sides, name and colour. */
function alike(a: DiceSetDie, b: LabDie): boolean {
  return a.sides === b.sides && (a.name ?? '') === (cleanDiceName(b.name) ?? '') && (a.colour ?? '') === (b.colour?.toLowerCase() ?? '');
}

/** The dice grouped as a set stores them: neighbours with the same sides, name and colour are one group. */
export function groupsOfDice(dice: readonly LabDie[]): DiceSetDie[] {
  const groups: DiceSetDie[] = [];
  for (const die of dice) {
    const last = groups.at(-1);
    if (last && alike(last, die)) {
      last.count += 1;
      continue;
    }
    const name = cleanDiceName(die.name);
    groups.push({ count: 1, sides: die.sides, ...(name && { name }), ...(die.colour !== undefined && { colour: die.colour.toLowerCase() }) });
  }
  return groups;
}

/** The limit `dice` break, or null when a set can roll them (an empty tray breaks none: it is not saved). */
export function diceLimit(dice: readonly LabDie[]): DiceLimit | null {
  if (dice.length > MAX_SET_DICE) return 'dice';
  return groupsOfDice(dice).length > MAX_SET_GROUPS ? 'groups' : null;
}

/** The die + adds: like the last die, without its name and colour; a d20 on an empty tray. */
export function nextDie(dice: readonly LabDie[]): LabDie {
  return { id: newDieId(), sides: dice.at(-1)?.sides ?? FIRST_SIDES, name: '' };
}

/** `dice` with `change` made to the die `id`. */
export function withChange(dice: readonly LabDie[], id: string, change: DieChange): LabDie[] {
  return dice.map((die) => {
    if (die.id !== id) return die;
    const next: LabDie = { ...die, ...change };
    // A colour taken off is no colour, not one left undefined in the record.
    if (next.colour === undefined) delete next.colour;
    return next;
  });
}

/** `dice` with a copy of the die `id` right after it. */
export function withCopy(dice: readonly LabDie[], id: string): LabDie[] {
  return dice.flatMap((die) => (die.id === id ? [die, { ...die, id: newDieId() }] : [die]));
}

/** `dice` without the die `id`. */
export function without(dice: readonly LabDie[], id: string): LabDie[] {
  return dice.filter((die) => die.id !== id);
}

/** `dice` with the die `id` moved to `index`, the place it takes among the others. */
export function withMove(dice: readonly LabDie[], id: string, index: number): LabDie[] {
  const die = dice.find((entry) => entry.id === id);
  if (!die) return [...dice];
  const rest = without(dice, id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, die);
  return rest;
}

/** The die a side of advantage rolls, as the tray shows it: apart from the set's dice. */
export interface EdgeDie {
  side: AdvantageSide;
  die: LabDie;
}

/** The dice the sides' rules roll, advantage first; a side that rolls none has none. */
export function edgeDiceOf(rules: Partial<Record<AdvantageSide, AdvantageRule | undefined>>): EdgeDie[] {
  return (['advantage', 'disadvantage'] as const).flatMap((side): EdgeDie[] => {
    const rule = rules[side];
    if (rule?.kind !== 'die') return [];
    return [{ side, die: { id: `edge-${side}`, sides: rule.sides, name: rule.name ?? '', ...(rule.colour !== undefined && { colour: rule.colour }) } }];
  });
}

/** The rule of a side whose die took `change`: its name as typed, a colour taken off gone. */
export function edgeRuleWith(die: LabDie, change: DieChange): AdvantageRule {
  const next = { ...die, ...change };
  return { kind: 'die', sides: next.sides, ...(next.name !== '' && { name: next.name }), ...(next.colour !== undefined && { colour: next.colour }) };
}
