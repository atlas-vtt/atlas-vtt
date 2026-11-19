/**
 * What a place of the tray's row does to what the tray holds: a die adds or takes back one of its kind, a saved
 * roll its own bracketed term (`diceTrayText.ts`), and either rolls alone with the tray's modifier. Pure.
 */
import type { DicePreset, DiceRowSlot } from '../../../types/dicePresetTypes';
import { MAX_DICE, MAX_PER_DIE, diceCounts, modifierSuffix, trayDiceCount, writeTray } from './diceTrayPool';
import { modifierOf, presetTerm, withDie, withPreset, withoutPresetTerms } from './diceTrayText';

const savedFormula = (slot: DiceRowSlot, presets: readonly DicePreset[]): string | undefined =>
  slot.kind === 'preset' ? presets.find((preset) => preset.id === slot.id)?.formula : undefined;

/** The dice of the row the tray holds, the saved rolls' own dice left out: the badges, and the limits. */
export function rowDiceCounts(formula: string, presets: readonly DicePreset[]): ReturnType<typeof diceCounts> {
  return diceCounts(withoutPresetTerms(formula, presets.map((preset) => preset.formula)));
}

/** The formula with one more (`delta` 1) or one fewer (−1) of the place; as it was where the place cannot. */
export function withSlot(formula: string, slot: DiceRowSlot, presets: readonly DicePreset[], delta: 1 | -1): string {
  if (slot.kind === 'preset') {
    const saved = savedFormula(slot, presets);
    return saved === undefined ? formula : withPreset(formula, saved, delta);
  }
  const held = rowDiceCounts(formula, presets);
  if (delta > 0 && ((held[slot.sides] ?? 0) >= MAX_PER_DIE || trayDiceCount(held) >= MAX_DICE)) return formula;
  return withDie(formula, slot.sides, delta, presets.map((preset) => preset.formula));
}

/** What a Shift-click on the place rolls: the die or saved roll alone, with the tray's modifier; null for neither. */
export function slotAlone(formula: string, slot: DiceRowSlot, presets: readonly DicePreset[]): string | null {
  const modifier = modifierOf(formula);
  if (slot.kind === 'die') return writeTray({ pool: { [slot.sides]: 1 }, modifier });
  const saved = savedFormula(slot, presets);
  if (saved === undefined) return null;
  return modifier === 0 ? saved : `${presetTerm(saved)}${modifierSuffix(modifier)}`;
}
