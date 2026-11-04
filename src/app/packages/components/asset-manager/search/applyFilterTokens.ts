import type { CreatureFacets } from '../../../../creatures/creatureFilterEngine';
import { LAYOUT_FACET, TEXT_FACET, withOptionState, withRange, withStatblockFilter } from '../../../../creatures/creatureSelection';
import { optionKey } from '../../../../creatures/creatureValues';
import type { QueryToken } from '../../../../search/querySyntax';
import type { CreatureFilterSelection, NumericRange } from '../../../../types/creatureFilterTypes';
import type { Tag } from '../types';
import { rangeValue, statblockValue, type FilterKeyword } from './filterKeywords';

/** The filters a search sets besides its text. */
export interface SearchFilters {
  selection: CreatureFilterSelection;
  tagIds: string[];
}

interface Sources {
  facets: CreatureFacets | null;
  tags: readonly Tag[];
}

/** Bounds for a typed comparison; `>` and `<` start at the next value the assets in view have. */
function boundsFor(op: QueryToken<FilterKeyword>['op'], typed: NumericRange, values: readonly number[]): NumericRange {
  switch (op) {
    case '>=': return { min: typed.min, max: Infinity };
    case '<=': return { min: -Infinity, max: typed.max };
    case '>': return { min: values.find((value) => value > typed.max) ?? Infinity, max: Infinity };
    case '<': return { min: -Infinity, max: [...values].reverse().find((value) => value < typed.min) ?? -Infinity };
    default: return typed;
  }
}

/**
 * The filters `tokens` set on top of `filters`, and the words that stay in the
 * search: plain words, `name:` values and tokens that name nothing (a tag that
 * does not exist) as typed. Negated options, templates and text are excluded.
 */
export function applyFilterTokens(
  text: string,
  tokens: readonly QueryToken<FilterKeyword>[],
  filters: SearchFilters,
  { facets, tags }: Sources,
): { filters: SearchFilters; words: string[] } {
  let { selection, tagIds } = filters;
  const words: string[] = [];
  for (const token of tokens) {
    const { keyword, value, negated } = token;
    const state = negated ? 'exclude' : 'include';
    switch (keyword.kind) {
      case 'name':
        words.push(value);
        break;
      case 'tag': {
        const tag = tags.find((candidate) => optionKey(candidate.name) === optionKey(value) || candidate.id === value);
        if (tag) tagIds = tagIds.includes(tag.id) ? tagIds : [...tagIds, tag.id];
        else words.push(text.slice(token.start, token.end));
        break;
      }
      case 'statblock':
        selection = withStatblockFilter(selection, statblockValue(value) ?? 'any');
        break;
      case 'text': {
        const phrase = value.trim().replace(/\s+/g, ' ').toLowerCase();
        if (phrase) selection = withOptionState(selection, TEXT_FACET, phrase, state);
        break;
      }
      case 'template': {
        // A Fantasy Statblocks layout and a native template may share the name: the name picks both
        const named = facets?.layouts.filter((candidate) => optionKey(candidate.label) === optionKey(value)) ?? [];
        for (const key of named.length > 0 ? named.map((option) => option.key) : [value]) {
          selection = withOptionState(selection, LAYOUT_FACET, key, state);
        }
        break;
      }
      case 'options':
        selection = withOptionState(selection, keyword.filterId, optionKey(value), state);
        break;
      case 'range': {
        const typed = rangeValue(value);
        if (!typed) break;
        const values = facets?.ranges.find((facet) => facet.definition.id === keyword.filterId)?.values.map((entry) => entry.value) ?? [];
        const domain = values.length > 0 ? { min: values[0]!, max: values.at(-1)! } : undefined;
        selection = withRange(selection, keyword.filterId, boundsFor(token.op, typed, values), domain);
        break;
      }
    }
  }
  return { filters: { selection, tagIds }, words };
}
