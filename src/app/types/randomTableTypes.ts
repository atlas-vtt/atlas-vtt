/** What a collection says about the random tables it rolls on, as stored in its `collection.json`. */

import type { RarityTone } from '../loot/lootRarity';

/**
 * What a table's results are: text to read out, items to hand out, or one result rolled from
 * every row (a generator, whose rows are its parts: `| Part | Result |`).
 */
export type RandomTableKind = 'text' | 'items' | 'generator';

/** A table in a Markdown note that the collection rolls on. Bases stay in `lootBases`. */
export interface RandomTableSource {
  /** Vault path of the note. */
  path: string;
  /** The table's name as the note gives it (its heading); absent for a note with one table and no heading. */
  table?: string;
  /** Which table of the note, counted from 0: finds the table again when its heading was renamed. */
  index: number;
  kind: RandomTableKind;
  /** The name the GM gave it in Atlas, shown in place of the note's; the note is never renamed. */
  label?: string;
  /** Column headers players never see (a rumour's "True?"). */
  hiddenColumns?: string[];
  /** Several rolled at once never repeat a row. */
  noRepeats?: boolean;
  /** A generator's results are saved as notes in this vault folder; without it they are not saved. */
  saveFolder?: string;
}

/** A word items of a collection name their rarity with, painted in one tone of the ladder or none. */
export interface RarityOption {
  name: string;
  tone: RarityTone | null;
}
