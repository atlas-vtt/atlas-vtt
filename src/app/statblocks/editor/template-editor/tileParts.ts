/**
 * The parts of a tile edited one by one on the card: a Metric's numbers,
 * added from the toolbar and the menu, named by double-clicking them, and
 * taken out by the × on each, never the last. (A Table's rows and columns are
 * the table's own, edited as Obsidian edits a table: `editor/table/`.)
 */

import { canAddMetricNumber, metricBlock } from '../../model/metricNumbers';
import type { StatblockTemplate } from '../../model/templateTypes';
import { addNumber, METRIC_FULL, metricNumberName, removeNumber } from './metricActions';
import type { EditOutcome } from './sessionEdit';
import type { EditorSession } from './sessionTypes';

export interface TileParts {
  /** What one part is called: the toolbar and the menu say it. */
  noun: 'number';
  /** Each part's name as the card shows it. */
  names: string[];
  canAdd: boolean;
  /** Why no more can be added, where none can. */
  full: string;
}

/** The parts of the tile `blockId`; null for a tile without any. */
export function tilePartsOf(template: StatblockTemplate, blockId: string): TileParts | null {
  const metric = metricBlock(template, blockId);
  if (!metric) return null;
  return {
    noun: 'number',
    names: metric.fields.map((_, index) => metricNumberName(template, blockId, index)),
    canAdd: canAddMetricNumber(template, blockId),
    full: METRIC_FULL,
  };
}

const NOTHING: EditOutcome = {};

/** One more part at the tile's end, not named yet. */
export function addPart(session: EditorSession, blockId: string): EditOutcome {
  return tilePartsOf(session.getSnapshot().template, blockId) ? addNumber(session, blockId) : NOTHING;
}

/** The tile without its part at `index`; never its last. */
export function removePart(session: EditorSession, blockId: string, index: number): EditOutcome {
  return tilePartsOf(session.getSnapshot().template, blockId) ? removeNumber(session, blockId, index) : NOTHING;
}
