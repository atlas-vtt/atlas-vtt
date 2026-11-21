/**
 * What a place of the tray's row does to what the tray holds: a die adds or takes back one of its kind, a saved
 * roll its own bracketed term (`diceTrayText.ts`), and either rolls alone with the tray's modifier. Pure.
 */
import type { DicePreset, DiceRowSlot } from '../../../types/dicePresetTypes';
import { MAX_DICE, MAX_PER_DIE, diceCounts, modifierSuffix, trayDiceCount, writeTray } from './diceTrayPool';
import { changedBeforeSide } from '../../../tools/writtenAdvantage';
import { modifierOf, presetTerm, withDie, withPreset, withoutPresetTerms } from './diceTrayText';

/** A saved roll written as a formula, which joins what the tray holds; a designed one rolls on its own. */
const savedFormula = (slot: DiceRowSlot, presets: readonly DicePreset[]): string | undefined =>
  (slot.kind === 'preset' ? presets.find((preset) => preset.id === slot.id && !preset.look)?.formula : undefined);

/** The formulas of the saved rolls that join the tray. */
const formulasOf = (presets: readonly DicePreset[]): string[] => presets.flatMap((preset) => (preset.look ? [] : [preset.formula]));

/** The saved roll a place stands for where its dice are designed (`look`): it rolls on its own, never joins the tray. */
export function designedPreset(slot: DiceRowSlot, presets: readonly DicePreset[]): DicePreset | undefined {
  return slot.kind === 'preset' ? presets.find((preset) => preset.id === slot.id && preset.look) : undefined;
}

/** The dice of the row the tray holds, the saved rolls' own dice left out: the badges, and the limits. */
export function rowDiceCounts(formula: string, presets: readonly DicePreset[]): ReturnType<typeof diceCounts> {
  return diceCounts(withoutPresetTerms(formula, formulasOf(presets)));
}

/** The formula with one more (`delta` 1) or one fewer (−1) of the place; as it was where the place cannot. */
export function withSlot(formula: string, slot: DiceRowSlot, presets: readonly DicePreset[], delta: 1 | -1): string {
  if (slot.kind === 'preset') {
    const saved = savedFormula(slot, presets);
    return saved === undefined ? formula : withPreset(formula, saved, delta);
  }
  const held = rowDiceCounts(formula, presets);
  if (delta > 0 && ((held[slot.sides] ?? 0) >= MAX_PER_DIE || trayDiceCount(held) >= MAX_DICE)) return formula;
  return withDie(formula, slot.sides, delta, formulasOf(presets));
}

/** What a Shift-click on the place rolls: the die or saved roll alone, with the tray's modifier; null for neither. */
export function slotAlone(formula: string, slot: DiceRowSlot, presets: readonly DicePreset[]): string | null {
  const modifier = modifierOf(formula);
  if (slot.kind === 'die') return writeTray({ pool: { [slot.sides]: 1 }, modifier });
  const saved = savedFormula(slot, presets);
  if (saved === undefined) return null;
  return modifier === 0 ? saved : changedBeforeSide(saved, (formula) => `${presetTerm(formula)}${modifierSuffix(modifier)}`);
}
