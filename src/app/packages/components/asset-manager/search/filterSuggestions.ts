import type { CreatureFacets, FacetOption } from '../../../../creatures/creatureFilterEngine';
import { formatRating } from '../../../../creatures/creatureValues';
import { matchingKeywords, queryContextAt, quoteValue, type QueryContext } from '../../../../search/querySyntax';
import type { Tag } from '../types';
import { suggestedKeywords, type FilterKeyword } from './filterKeywords';
import { t } from '../../../../i18n';

export type FilterSuggestion =
  /** `negated`: typed after a `-`, so it completes to `-prefix:`. */
  | { kind: 'keyword'; keyword: FilterKeyword; negated: boolean }
  | { kind: 'value'; label: string; insert: string; count?: number };

export interface FilterSuggestions {
  /** Keywords while one is typed, values after its operator. */
  mode: 'keyword' | 'value';
  heading: string;
  items: FilterSuggestion[];
  /** Explains a value that is typed freely, like a name or a number. */
  hint?: string;
  context: QueryContext<FilterKeyword>;
}

interface SuggestionSources {
  keywords: readonly FilterKeyword[];
  lookup: ReadonlyMap<string, FilterKeyword>;
  facets: CreatureFacets | null;
  tags: readonly Tag[];
}

const STATBLOCK_CHOICES = [
  { label: 'yes', detail: 'with a statblock', value: 'linked' },
  { label: 'no', detail: 'without a statblock', value: 'unlinked' },
] as const;

/** The template facet's options by name: a Fantasy Statblocks layout and a native template of one name are one value to type. */
function templateNames(options: readonly FacetOption[]): Array<{ label: string; count: number }> {
  const byName = new Map<string, { label: string; count: number }>();
  for (const option of options) {
    const named = byName.get(option.label);
    if (named) named.count += option.count;
    else byName.set(option.label, { label: option.label, count: option.count });
  }
  return [...byName.values()];
}

function matches(label: string, fragment: string): boolean {
  return label.toLowerCase().includes(fragment.toLowerCase());
}

function valueItems(keyword: FilterKeyword, fragment: string, { facets, tags }: SuggestionSources): FilterSuggestion[] {
  const value = (label: string, count?: number): FilterSuggestion => ({ kind: 'value', label, insert: quoteValue(label), ...(count !== undefined && { count }) });
  switch (keyword.kind) {
    case 'tag':
      return tags.filter((tag) => matches(tag.name, fragment)).map((tag) => value(tag.name));
    case 'statblock':
      return STATBLOCK_CHOICES
        .filter((choice) => choice.label.startsWith(fragment.toLowerCase()))
        .map((choice) => value(choice.label, facets?.statblock[choice.value]));
    case 'template':
      return templateNames(facets?.layouts ?? []).filter((template) => matches(template.label, fragment)).map((template) => value(template.label, template.count));
    case 'options': {
      const facet = facets?.options.find((candidate) => candidate.definition.id === keyword.filterId);
      return (facet?.options ?? []).filter((option) => matches(option.label, fragment)).map((option) => value(option.label, option.count));
    }
    case 'range': {
      const facet = facets?.ranges.find((candidate) => candidate.definition.id === keyword.filterId);
      return (facet?.values ?? [])
        .map((entry) => ({ label: formatRating(entry.value), count: entry.count }))
        .filter((entry) => entry.label.startsWith(fragment))
        .map((entry) => value(entry.label, entry.count));
    }
    default:
      return [];
  }
}

/**
 * What the dropdown under the search offers at the cursor: keywords while one
 * is typed, the values in view after its operator. Null while a plain word is
 * typed that is no keyword, so a name search is not interrupted.
 */
export function filterSuggestions(text: string, cursor: number, sources: SuggestionSources): FilterSuggestions | null {
  const context = queryContextAt(text, cursor, sources.lookup);
  if (context.kind === 'prefix') {
    // The full list shows only keywords the assets in view have values for. A typed fragment is
    // also a name search that may empty the view, so it matches every keyword.
    const negated = context.fragment.startsWith('-');
    const fragment = negated ? context.fragment.slice(1) : context.fragment;
    const offered = (fragment ? sources.keywords : suggestedKeywords(sources.keywords, sources.facets, sources.tags.length > 0))
      .filter((keyword) => !negated || keyword.negatable);
    const items = matchingKeywords(offered, fragment).map((keyword): FilterSuggestion => ({ kind: 'keyword', keyword, negated }));
    return items.length > 0 ? { mode: 'keyword', heading: negated ? t('filters.exclude') : t('filters.filterBy'), items, context } : null;
  }
  const { keyword } = context;
  // A value typed in full comes first, so Enter takes it rather than a longer one ("1", not "1/4").
  const typed = context.fragment.toLowerCase();
  const items = valueItems(keyword, context.fragment, sources)
    .sort((a, b) => Number(b.kind === 'value' && b.label.toLowerCase() === typed) - Number(a.kind === 'value' && a.label.toLowerCase() === typed));
  const typedFreely = keyword.kind === 'name' || keyword.kind === 'range' || keyword.kind === 'text';
  const label = keyword.description.split(':')[0]!;
  return {
    mode: 'value',
    heading: context.negated ? t('filters.excludeField', { field: label.toLocaleLowerCase() }) : label,
    items,
    ...(typedFreely && { hint: keyword.description }),
    context,
  };
}
