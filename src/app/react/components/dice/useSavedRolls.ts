import { useState } from 'react';
import type { DiceTool } from '../../../tools/DiceTool';
import type { DicePreset } from '../../../types/dicePresetTypes';
import type { AdvantageSide, DiceSet } from '../../../types/diceSetTypes';
import { useDiceSets } from '../../hooks/useDiceSets';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { withPresetReplaced, type DiceShelf, type ShelfChange } from './diceShelf';
import { rollSavedRoll } from './rollSavedRoll';
import { useDiceShelf } from './useDiceShelf';

export interface SavedRolls {
  shelf: DiceShelf;
  /** Writes a change; null where the scene is in no collection, which keeps no saved rolls. */
  change: ((change: ShelfChange) => void) | null;
  /** The Dice Lab's sets, which can be kept as saved rolls. */
  sets: readonly DiceSet[];
  /** Rolls a saved roll: a formula as written, designed dice as their own set (its names, colours and rules). */
  roll: (preset: DicePreset, side?: AdvantageSide | null) => void;
  /** The saved roll whose editor is open, or null. */
  editing: DicePreset | null;
  setEditing: (id: string | null) => void;
  /** Writes a saved roll its editor changed. */
  save: (preset: DicePreset) => void;
}

/** The view's saved rolls, how they roll through `diceTool`, and which one is being edited. */
export function useSavedRolls(diceTool: DiceTool): SavedRolls {
  const { app } = useAtlasUI();
  const { shelf, change } = useDiceShelf();
  const { sets } = useDiceSets(app);
  const [editingId, setEditing] = useState<string | null>(null);

  const roll = (preset: DicePreset, side: AdvantageSide | null = null): void => rollSavedRoll(diceTool, preset, side);

  return {
    shelf,
    change,
    sets,
    roll,
    editing: shelf.presets.find((preset) => preset.id === editingId) ?? null,
    setEditing,
    save: (preset) => change?.(withPresetReplaced(shelf, preset)),
  };
}
