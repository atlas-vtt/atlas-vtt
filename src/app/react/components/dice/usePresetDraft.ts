import { useCallback, useEffect, useRef, useState } from 'react';
import type { DicePreset } from '../../../types/dicePresetTypes';
import { diceOfGroups, groupsOfDice } from '../collection-settings/dice-lab/labDice';
import { advantageRules, writable, type EditPace, type LabDraft } from '../collection-settings/dice-lab/useLabSet';
import { MAX_PRESET_NAME } from './diceShelf';
import { bonusText, lookBonus } from './presetLook';

/** A saved roll as its editor changes it: the Dice Lab's draft of its dice, its bonus, or its formula. */
export interface PresetDraft extends LabDraft {
  bonus: number;
  /** The formula of a saved roll written as one (no `look`). */
  formula: string;
}

/** How long typing rests before the roll is written: every write saves the collection's settings. */
const SAVE_AFTER_MS = 400;

function draftOf(preset: DicePreset): PresetDraft {
  const look = preset.look;
  return {
    name: preset.name,
    dice: look ? diceOfGroups(look.dice) : [],
    crit: look?.crit ?? 'natural',
    ...(look?.explode && { explode: look.explode }),
    ...(look?.advantage && { advantage: look.advantage }),
    ...(look?.disadvantage && { disadvantage: look.disadvantage }),
    bonus: look ? lookBonus(preset) : 0,
    formula: look ? '' : preset.formula,
  };
}

/** The saved roll a draft makes; null while something of it cannot be written yet (no name, no dice, half a rule). */
export function presetOfDraft(preset: DicePreset, draft: PresetDraft): DicePreset | null {
  const name = draft.name.trim().slice(0, MAX_PRESET_NAME);
  if (name === '') return null;
  if (!preset.look) return draft.formula.trim() === '' ? null : { id: preset.id, name, formula: draft.formula.trim() };
  const can = writable(draft, null);
  if (!can.dice || !can.explode || !can.advantage || !can.disadvantage) return null;
  return {
    id: preset.id,
    name,
    formula: bonusText(draft.bonus),
    look: {
      dice: groupsOfDice(draft.dice),
      crit: draft.crit,
      ...(draft.explode && { explode: draft.explode }),
      ...advantageRules(draft),
    },
  };
}

export interface PresetEditing {
  draft: PresetDraft;
  edit: (change: Partial<PresetDraft>, pace: EditPace) => void;
}

/**
 * A saved roll as its editor changes it, written as the Dice Lab writes a set: a click at once, typing once it
 * rests; what cannot be written yet waits. Whatever waits is written when the editor closes.
 */
export function usePresetDraft(preset: DicePreset, onSave: (preset: DicePreset) => void): PresetEditing {
  const [draft, setDraft] = useState(() => draftOf(preset));
  const current = useRef(draft);
  const timer = useRef<number | null>(null);
  const save = useRef(onSave);
  save.current = onSave;
  const written = useRef(JSON.stringify(preset));

  const write = useCallback((): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const next = presetOfDraft(preset, current.current);
    if (!next || JSON.stringify(next) === written.current) return;
    written.current = JSON.stringify(next);
    save.current(next);
  }, [preset]);

  const edit = useCallback((change: Partial<PresetDraft>, pace: EditPace): void => {
    current.current = { ...current.current, ...change };
    setDraft(current.current);
    if (pace === 'now') {
      write();
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(write, SAVE_AFTER_MS);
  }, [write]);

  const pending = useRef(write);
  pending.current = write;
  useEffect(() => () => { if (timer.current !== null) pending.current(); }, []);

  return { draft, edit };
}
