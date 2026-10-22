/** Immutable edits of a `CreatureFilterSelection`, as the asset manager's filter controls make them. */

import type {
  CreatureFilterDefinition,
  CreatureFilterSelection,
  NumericRange,
  OptionPicks,
  OptionState,
  StatblockLinkFilter,
} from '../types/creatureFilterTypes';

/** The facet ids of the filters every collection has; filter ids are slugs, so they never clash. */
export const STATBLOCK_FACET = '@statblock';
export const LAYOUT_FACET = '@layouts';
export const TEXT_FACET = '@text';

const NO_PICKS: OptionPicks = { include: [], exclude: [] };

/** `record` without `key`, or with it set to `value`. */
function withEntry<T>(record: Record<string, T>, key: string, value: T | null): Record<string, T> {
  const next = { ...record };
  if (value === null) delete next[key];
  else next[key] = value;
  return next;
}

export function hasPicks(picks: OptionPicks | undefined): boolean {
  return Boolean(picks && (picks.include.length > 0 || picks.exclude.length > 0));
}

/** The picks of the layout facet, the text facet or an options filter. */
export function picksOf(selection: CreatureFilterSelection, facet: string): OptionPicks {
  if (facet === LAYOUT_FACET) return selection.layouts;
  if (facet === TEXT_FACET) return selection.text;
  return selection.options[facet] ?? NO_PICKS;
}

function withPicks(selection: CreatureFilterSelection, facet: string, picks: OptionPicks): CreatureFilterSelection {
  if (facet === LAYOUT_FACET) return { ...selection, layouts: picks };
  if (facet === TEXT_FACET) return { ...selection, text: picks };
  return { ...selection, options: withEntry(selection.options, facet, hasPicks(picks) ? picks : null) };
}

export function optionState(picks: OptionPicks, key: string): OptionState {
  if (picks.include.includes(key)) return 'include';
  return picks.exclude.includes(key) ? 'exclude' : null;
}

/** Requires, excludes or clears one option of a facet. */
export function withOptionState(selection: CreatureFilterSelection, facet: string, key: string, state: OptionState): CreatureFilterSelection {
  const picks = picksOf(selection, facet);
  if (optionState(picks, key) === state) return selection;
  const include = picks.include.filter((candidate) => candidate !== key);
  const exclude = picks.exclude.filter((candidate) => candidate !== key);
  if (state === 'include') include.push(key);
  if (state === 'exclude') exclude.push(key);
  return withPicks(selection, facet, { include, exclude });
}

/** A click: requires the option, or clears it (also an exclusion). */
export function toggleOption(selection: CreatureFilterSelection, facet: string, key: string): CreatureFilterSelection {
  const state = optionState(picksOf(selection, facet), key);
  return withOptionState(selection, facet, key, state === null ? 'include' : null);
}

/** A double or Alt-click: excludes the option, or clears the exclusion. */
export function toggleExcludedOption(selection: CreatureFilterSelection, facet: string, key: string): CreatureFilterSelection {
  const state = optionState(picksOf(selection, facet), key);
  return withOptionState(selection, facet, key, state === 'exclude' ? null : 'exclude');
}

export function withStatblockFilter(selection: CreatureFilterSelection, statblock: StatblockLinkFilter): CreatureFilterSelection {
  return { ...selection, statblock };
}

/** Sets a range filter's bounds; null, or bounds spanning every value in view, stop it filtering. */
export function withRange(
  selection: CreatureFilterSelection,
  filterId: string,
  range: NumericRange | null,
  domain?: NumericRange,
): CreatureFilterSelection {
  const spansDomain = range !== null && domain !== undefined && range.min <= domain.min && range.max >= domain.max;
  return { ...selection, ranges: withEntry(selection.ranges, filterId, spansDomain ? null : range) };
}

/** Clears the filters of one facet: `STATBLOCK_FACET`, `LAYOUT_FACET`, `TEXT_FACET`, or a filter id. */
export function clearFacet(selection: CreatureFilterSelection, facet: string): CreatureFilterSelection {
  if (facet === STATBLOCK_FACET) return { ...selection, statblock: 'any' };
  if (facet === LAYOUT_FACET) return { ...selection, layouts: NO_PICKS };
  if (facet === TEXT_FACET) return { ...selection, text: NO_PICKS };
  return { ...selection, ranges: withEntry(selection.ranges, facet, null), options: withEntry(selection.options, facet, null) };
}

/** How many filters narrow the list: one per facet with something picked. */
export function activeFilterCount(selection: CreatureFilterSelection, definitions: readonly CreatureFilterDefinition[]): number {
  let count = (selection.statblock === 'any' ? 0 : 1) + (hasPicks(selection.layouts) ? 1 : 0) + (hasPicks(selection.text) ? 1 : 0);
  for (const definition of definitions) {
    if (definition.kind === 'range' ? selection.ranges[definition.id] : hasPicks(selection.options[definition.id])) count++;
  }
  return count;
}

/**
 * The selection without picks for filters the collection no longer defines (or
 * defines with another kind). Returns `selection` itself when nothing goes.
 */
export function pruneSelection(selection: CreatureFilterSelection, definitions: readonly CreatureFilterDefinition[]): CreatureFilterSelection {
  const rangeIds = new Set(definitions.filter((definition) => definition.kind === 'range').map((definition) => definition.id));
  const optionIds = new Set(definitions.filter((definition) => definition.kind === 'options').map((definition) => definition.id));
  const staleRanges = Object.keys(selection.ranges).filter((id) => !rangeIds.has(id));
  const staleOptions = Object.keys(selection.options).filter((id) => !optionIds.has(id));
  if (staleRanges.length === 0 && staleOptions.length === 0) return selection;
  const ranges = { ...selection.ranges };
  const options = { ...selection.options };
  for (const id of staleRanges) delete ranges[id];
  for (const id of staleOptions) delete options[id];
  return { ...selection, ranges, options };
}
