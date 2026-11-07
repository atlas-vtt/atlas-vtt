/**
 * Faceted filtering of tokens by their statblocks. Options within one filter
 * are alternatives (or all required, for alignment parts), filters narrow each
 * other, and an excluded option hides every token that has it. Each facet
 * counts the tokens the other filters leave, so picking "Beast" does not zero
 * the other types. A token without the data a required option reads is
 * hidden, and counted in `hidden` so the list can say why.
 */

import type {
  CreatureFilterDefinition,
  CreatureFilterSelection,
  CreatureOptionsFilter,
  CreatureRangeFilter,
  NumericRange,
  OptionPicks,
  OptionState,
} from '../types/creatureFilterTypes';
import type { OptionValue, TokenFacts } from './creatureFacts';
import { hasPicks, LAYOUT_FACET, optionState, STATBLOCK_FACET, TEXT_FACET } from './creatureSelection';
import { statblockText } from './statblockText';
import { pickedOptionLabel, templateOptions } from './templateFacet';
import { ALIGNMENT_PARTS, optionKey } from './creatureValues';

export interface FacetOption extends OptionValue {
  /** Tokens it would show, given the other filters. */
  count: number;
  state: OptionState;
}

export interface RangeFacet {
  definition: CreatureRangeFilter;
  /** Every value the tokens in view have, ascending, with the tokens the other filters leave at each. */
  values: ReadonlyArray<{ value: number; count: number }>;
  selected: NumericRange | null;
}

export interface OptionsFacet {
  definition: CreatureOptionsFilter;
  options: readonly FacetOption[];
}

export interface CreatureFacets {
  statblock: { any: number; linked: number; unlinked: number };
  layouts: readonly FacetOption[];
  ranges: readonly RangeFacet[];
  options: readonly OptionsFacet[];
}

/** Tokens hidden only because they lack what a filter reads. */
export interface HiddenSummary {
  withoutStatblock: number;
  /** By filter, for tokens whose statblock lacks the field. */
  withoutField: ReadonlyArray<{ id: string; label: string; count: number }>;
}

export interface CreatureFilterResult {
  /** Whether each token passes, in the order of the facts. */
  passes: readonly boolean[];
  facets: CreatureFacets;
  hidden: HiddenSummary;
}

type Outcome = 'pass' | 'fail' | 'missing';

interface Check {
  id: string;
  test: (facts: TokenFacts) => Outcome;
}

const fieldCheckId = (definitionId: string): string => `field:${definitionId}`;

const outcome = (passes: boolean): Outcome => (passes ? 'pass' : 'fail');

/** "Level 2" before "Level 10"; case and accents do not matter. */
const LABEL_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const optionValues = (definition: CreatureOptionsFilter) => (facts: TokenFacts): readonly OptionValue[] =>
  facts.options.get(definition.id) ?? [];

/**
 * An excluded value fails a token; one without the field passes, it is none
 * of them. Required values fail a token without the field as missing data, and
 * need any one (`any`) or every one (`all`) of them.
 */
function optionsCheck(
  id: string,
  picks: OptionPicks | undefined,
  match: 'any' | 'all',
  valuesOf: (facts: TokenFacts) => readonly OptionValue[],
): Check | null {
  if (!picks || !hasPicks(picks)) return null;
  const exclude = new Set(picks.exclude);
  return {
    id,
    test: (facts) => {
      const keys = valuesOf(facts).map((value) => value.key);
      if (keys.some((key) => exclude.has(key))) return 'fail';
      if (picks.include.length === 0) return 'pass';
      if (keys.length === 0) return 'missing';
      return outcome(match === 'all' ? picks.include.every((key) => keys.includes(key)) : keys.some((key) => picks.include.includes(key)));
    },
  };
}

/**
 * Every required phrase must stand somewhere in the statblock's text and no excluded one may; a
 * token without a statblock lacks the text, so it is missing data when a phrase is required.
 */
function phrasesCheck(picks: OptionPicks): Check | null {
  if (!hasPicks(picks)) return null;
  return {
    id: TEXT_FACET,
    test: (facts) => {
      const text = facts.creature ? statblockText(facts.creature) : '';
      if (picks.exclude.some((phrase) => text.includes(phrase))) return 'fail';
      if (picks.include.length === 0) return 'pass';
      if (!facts.creature) return 'missing';
      return outcome(picks.include.every((phrase) => text.includes(phrase)));
    },
  };
}

/** The checks the selection makes; filters that pick nothing make none. */
function activeChecks(definitions: readonly CreatureFilterDefinition[], selection: CreatureFilterSelection): Check[] {
  const checks: Check[] = [];
  if (selection.statblock !== 'any') {
    const wanted = selection.statblock === 'linked';
    checks.push({ id: STATBLOCK_FACET, test: (facts) => outcome(facts.linked === wanted) });
  }
  const layoutCheck = optionsCheck(LAYOUT_FACET, selection.layouts, 'any', templateOptions);
  if (layoutCheck) checks.push(layoutCheck);
  const textCheck = phrasesCheck(selection.text);
  if (textCheck) checks.push(textCheck);
  for (const definition of definitions) {
    if (definition.kind === 'range') {
      const range = selection.ranges[definition.id];
      if (!range) continue;
      checks.push({
        id: fieldCheckId(definition.id),
        test: (facts) => {
          const value = facts.ratings.get(definition.id);
          return value == null ? 'missing' : outcome(value >= range.min && value <= range.max);
        },
      });
      continue;
    }
    const check = optionsCheck(fieldCheckId(definition.id), selection.options[definition.id], definition.match ?? 'any', optionValues(definition));
    if (check) checks.push(check);
  }
  return checks;
}

/** Tokens a facet counts: those failing no check, or only its own. */
function counted(failures: ReadonlyArray<readonly string[]>, checkId: string): (index: number) => boolean {
  return (index) => {
    const failed = failures[index] ?? [];
    return failed.length === 0 || (failed.length === 1 && failed[0] === checkId);
  };
}

/** Canonical positions for options that have one (alignment parts); others sort by frequency. */
const ALIGNMENT_ORDER = new Map(ALIGNMENT_PARTS.map((part, index) => [optionKey(part), index]));

/**
 * The options of a facet with how many tokens each would show: tokens the
 * other filters leave, that do not have an excluded value (other than the
 * option itself) and, for `all` facets, have the options already required.
 * Options sort by how often they occur among all tokens in view, so they keep
 * their place as filters change; alignment parts keep their usual order.
 */
function optionFacet(
  facts: readonly TokenFacts[],
  valuesOf: (facts: TokenFacts) => readonly OptionValue[],
  isCounted: (index: number) => boolean,
  picks: OptionPicks,
  match: 'any' | 'all',
): FacetOption[] {
  const byKey = new Map<string, { labels: Map<string, number>; total: number; count: number }>();
  facts.forEach((token, index) => {
    const values = valuesOf(token);
    const keys = values.map((value) => value.key);
    const counts = isCounted(index) && (match === 'any' || picks.include.every((key) => keys.includes(key)));
    for (const { key, label } of values) {
      const entry = byKey.get(key) ?? { labels: new Map<string, number>(), total: 0, count: 0 };
      entry.labels.set(label, (entry.labels.get(label) ?? 0) + 1);
      entry.total++;
      if (counts && !keys.some((other) => other !== key && picks.exclude.includes(other))) entry.count++;
      byKey.set(key, entry);
    }
  });
  for (const key of [...picks.include, ...picks.exclude]) {
    if (!byKey.has(key)) byKey.set(key, { labels: new Map([[pickedOptionLabel(key), 1]]), total: 0, count: 0 });
  }
  const options = [...byKey.entries()].map(([key, entry]) => ({
    option: {
      key,
      // The spelling most tokens use.
      label: [...entry.labels.entries()].reduce((best, next) => (next[1] > best[1] ? next : best))[0],
      count: entry.count,
      state: optionState(picks, key),
    },
    total: entry.total,
    rank: ALIGNMENT_ORDER.get(key),
  }));
  options.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.total - a.total || LABEL_ORDER.compare(a.option.label, b.option.label));
  return options.map(({ option }) => option);
}

function rangeFacet(facts: readonly TokenFacts[], definition: CreatureRangeFilter, isCounted: (index: number) => boolean, selected: NumericRange | undefined): RangeFacet {
  const counts = new Map<number, number>();
  facts.forEach((token, index) => {
    const value = token.ratings.get(definition.id);
    if (value == null) return;
    counts.set(value, (counts.get(value) ?? 0) + (isCounted(index) ? 1 : 0));
  });
  const values = [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => a.value - b.value);
  return { definition, values, selected: selected ?? null };
}

function hiddenSummary(
  facts: readonly TokenFacts[],
  outcomes: ReadonlyArray<ReadonlyArray<[string, Outcome]>>,
  definitions: readonly CreatureFilterDefinition[],
): HiddenSummary {
  let withoutStatblock = 0;
  const withoutField = new Map<string, number>();
  facts.forEach((token, index) => {
    const failed = (outcomes[index] ?? []).filter(([, result]) => result !== 'pass');
    if (failed.length === 0 || failed.some(([, result]) => result === 'fail')) return;
    if (!token.creature) {
      withoutStatblock++;
      return;
    }
    const first = failed[0]?.[0];
    if (first) withoutField.set(first, (withoutField.get(first) ?? 0) + 1);
  });
  return {
    withoutStatblock,
    withoutField: definitions.flatMap(({ id, label }) => {
      const count = withoutField.get(fieldCheckId(id));
      return count ? [{ id, label, count }] : [];
    }),
  };
}

/** Filters the tokens and counts what each facet would show. */
export function evaluateCreatureFilters(
  facts: readonly TokenFacts[],
  definitions: readonly CreatureFilterDefinition[],
  selection: CreatureFilterSelection,
): CreatureFilterResult {
  const checks = activeChecks(definitions, selection);
  const outcomes = facts.map((token) => checks.map((check): [string, Outcome] => [check.id, check.test(token)]));
  const failures = outcomes.map((results) => results.filter(([, result]) => result !== 'pass').map(([id]) => id));
  const passes = failures.map((failed) => failed.length === 0);

  const statblockCounted = counted(failures, STATBLOCK_FACET);
  const statblock = { any: 0, linked: 0, unlinked: 0 };
  facts.forEach((token, index) => {
    if (!statblockCounted(index)) return;
    statblock.any++;
    statblock[token.linked ? 'linked' : 'unlinked']++;
  });

  const layouts = optionFacet(facts, templateOptions, counted(failures, LAYOUT_FACET), selection.layouts, 'any');

  const ranges: RangeFacet[] = [];
  const options: OptionsFacet[] = [];
  for (const definition of definitions) {
    const isCounted = counted(failures, fieldCheckId(definition.id));
    if (definition.kind === 'range') {
      ranges.push(rangeFacet(facts, definition, isCounted, selection.ranges[definition.id]));
    } else {
      options.push({
        definition,
        options: optionFacet(facts, optionValues(definition), isCounted, selection.options[definition.id] ?? { include: [], exclude: [] }, definition.match ?? 'any'),
      });
    }
  }

  return {
    passes,
    facets: { statblock, layouts, ranges, options },
    hidden: hiddenSummary(facts, outcomes, definitions),
  };
}
