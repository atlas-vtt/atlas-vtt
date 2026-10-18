import { createContext, useContext } from 'react';
import type { ArmableValue, ArmableValues } from './armableValues';
import type { ArmedBonuses } from './armedBonuses';

/** What a card's "Add to next roll" switches arm, given by `StatblockSheet`. */
export interface RollBonusTarget {
  /** The statblock's key in the store (`statblockBonusKey`). */
  key: string;
  /** The values the card shows that add to rolls. */
  armable: ArmableValues;
  /** The app's armed values; null where the card only previews a template (the template editor): its switches are inert. */
  store: ArmedBonuses | null;
}

export const RollBonusContext = createContext<RollBonusTarget | null>(null);

export function useRollBonusTarget(): RollBonusTarget | null {
  return useContext(RollBonusContext);
}

/**
 * The value `id` stands for where the card adds it to rolls; undefined elsewhere, and for a block that does
 * not add to rolls (`adds`) though it shows the same field (the header's level).
 */
export function useArmable(id: string, adds: boolean | undefined): ArmableValue | undefined {
  const armable = useContext(RollBonusContext)?.armable;
  return adds ? armable?.get(id) : undefined;
}

/**
 * Which statblock a card stands for, for its armed values: its note, so every
 * view of the note shares them; else its name; else the one card (`sheetId`).
 */
export function statblockBonusKey(notePath: string | undefined, name: string | undefined, sheetId: string): string {
  if (notePath) return `note:${notePath}`;
  return name ? `name:${name}` : `sheet:${sheetId}`;
}
