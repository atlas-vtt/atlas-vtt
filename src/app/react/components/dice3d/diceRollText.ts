import type { DiceScene } from '../../../dice3d/diceScene';
import { diceList, diceSum, keptRolls, namedDiceLine, rollFormulaText } from '../../../tools/diceLabels';
import { formulaLabel, modifierText, namedModifiersOf, withoutConstantLabels } from '../../../tools/namedModifiers';
import type { DiceRollResult } from '../../../types/diceTypes';
import type { RollAudience } from '../dice/diceSourcePresentation';
import { t } from '../../../i18n';

/**
 * A formula as a roll shows it: its subtractions with a true minus (`1d20 − 2`), never a
 * hyphen. A label in brackets (`2d6[fire-bolt]`) keeps its own hyphens.
 */
export function shownFormula(formula: string): string {
  return formula.replace(/\[[^\]]*\]|-/g, (part) => (part === '-' ? '\u2212' : part));
}

/**
 * What a roll is named: its action, then the labels of its constants that name something else
 * ("Agility + Pickpocket" for Agility rolled with Pickpocket armed; "Stealth" for a typed
 * `1d20+2[Stealth]`). Empty where it names nothing. The roll's lines show only numbers.
 */
export function rollName(result: Pick<DiceRollResult, 'source' | 'modifiers' | 'namedModifiers'>): string {
  const names = new Map<string, string>();
  for (const name of [result.source?.abilityName ?? '', ...namedModifiersOf(result).map((term) => term.label)]) {
    // As a formula writes it: a statblock labels a bare bonus with its action's name that way.
    const key = formulaLabel(name).toLocaleLowerCase();
    if (key !== '' && !names.has(key)) names.set(key, name.trim());
  }
  return [...names.values()].join(' + ');
}

/**
 * What a roll is titled with: its name (`rollName`), else its formula ("2d6 + 1d20 + 3",
 * after the dice set where that was not the collection's); "Roll" only for a roll that has
 * neither. Never who rolled it: the creature's portrait beside the title says that.
 */
export function rollLabel(result: DiceRollResult): string {
  return rollName(result) || rollFormula(result) || t('diceRoll.label');
}

/**
 * What a roll rolled as it shows it: its formula with a true minus and without the labels of its
 * constants (the title names them), after the dice set where that was not the collection's.
 */
export function rollFormula(result: Pick<DiceRollResult, 'formula' | 'diceSet'>): string {
  return rollFormulaText({ formula: shownFormula(withoutConstantLabels(result.formula)), diceSet: result.diceSet });
}

/**
 * A roll's title with the side of advantage it was made with, where it was: "1d20 + 5 · Advantage".
 * The header names the side on the 3D panel and the card alike, in the same words as the tray.
 */
export function withSide(title: string, result: Pick<DiceRollResult, 'advantage'>): string {
  const side = advantageText(result);
  return side === null ? title : t('diceRoll.titleWithSide', { title, side });
}

/** Whether the title is the roll's formula, set in the interface font, rather than an action's name. */
export function titledByFormula(result: DiceRollResult): boolean {
  return rollName(result) === '' && result.formula !== '';
}

/** "Critical success" or "Critical failure", as the roll's own `crit` says; null otherwise. */
export function critText(crit: DiceRollResult['crit']): string | null {
  if (crit === 'high') return t('diceRoll.critSuccess');
  if (crit === 'low') return t('diceRoll.critFailure');
  return null;
}

/**
 * What a screen reader hears of a roll, once, as it arrives: its title and total, whether it
 * was critical, and on the GM's own display whom it was shown to. One sentence each.
 */
export function rollAnnouncement(result: DiceRollResult, audience: RollAudience | undefined): string {
  const sentences = [t('diceRoll.announce', { title: withSide(rollLabel(result), result), total: String(result.total) })];
  if (result.crit === 'high') sentences.push(t('diceRoll.announceCritSuccess'));
  if (result.crit === 'low') sentences.push(t('diceRoll.announceCritFailure'));
  if (audience) sentences.push(audience === 'players' ? t('diceRoll.announceShown') : t('diceRoll.announceHidden'));
  return sentences.join(' ');
}

/** "Advantage" or "Disadvantage", where the roll was made with it. */
export function advantageText(result: Pick<DiceRollResult, 'advantage'>): string | null {
  if (!result.advantage) return null;
  return result.advantage === 'advantage' ? t('dice.advantage') : t('dice.disadvantage');
}

/** The dice a roll counts: with advantage only the kept ones (the dropped die only fades on the stage). */
function countedRolls(result: DiceRollResult): DiceRollResult['rolls'] {
  return result.advantage ? keptRolls(result.rolls) : result.rolls;
}

/**
 * The line under the total (`17 + 5`; the side of advantage is in the header, `withSide`): the dice, with the names a dice set gave them (`Sun 9 · Moon 4 + 3`).
 * Dice a written keep or drop left out are named in brackets (`3 + (1) + 6`); the die
 * advantage dropped only fades on the stage, since the side named in the header says
 * why. A die stood in for another (a d2 on a d6) explains itself, since a 6 on the stage
 * next to a total of 2 looks like an error. More than six dice are summed rather than
 * listed: the chain would wrap, the panel holds one line, and the pips lie on the stage
 * anyway. A formula that is no plain sum (`2d6*2`, `8d10cs>=8`) lists its dice instead
 * of adding them up.
 */
export function rollBreakdown(result: DiceRollResult, scene: DiceScene): string | null {
  const thrown = result.rolls.filter((roll) => !roll.rerolled).length;
  if (result.linear === false) return thrown > 6 ? `${thrown} dice` : diceList(result.rolls);

  const suffix = modifierText(result.modifiers);
  const kept = keptRolls(result.rolls);
  const shown = countedRolls(result);
  const diceTotal = result.total - result.modifiers;
  const plain = result.rolls.every((roll) => !roll.rerolled && !roll.dropped);

  if (scene.plan[0]?.role === 'tens') {
    const value = kept[0]?.value ?? 0;
    return t('diceRoll.tensUnits', { tens: String(Math.floor((value % 100) / 10) * 10).padStart(2, '0'), units: String(value % 10) }) + suffix;
  }
  const named = namedDiceLine(result.rolls, result);
  if (named !== null && kept.length <= 6) return named;
  if (thrown > 6) return t('diceRoll.manyDice', { number: String(thrown), total: String(diceTotal) }) + suffix;
  if (scene.plan.some((die) => die.fold !== undefined) && (plain || result.advantage)) {
    const faces = scene.faces.filter((_, i) => !scene.plan[i]?.dropped);
    return t('diceRoll.folded', { faces: faces.join(' + '), sides: String(scene.plan[0]!.sides), values: kept.map((roll) => roll.value).join(' + ') }) + suffix;
  }
  return shown.length > 1 || suffix !== '' ? `${diceSum(shown)}${suffix}` : null;
}

/** Whether a breakdown line will show, known before landing so the panel never grows. */
export function hasBreakdown(result: DiceRollResult, scene: DiceScene): boolean {
  return result.advantage !== undefined
    || scene.plan[0]?.role === 'tens'
    || scene.plan.some((die) => die.fold !== undefined)
    || countedRolls(result).length > 1
    || result.modifiers !== 0
    || result.linear === false;
}
