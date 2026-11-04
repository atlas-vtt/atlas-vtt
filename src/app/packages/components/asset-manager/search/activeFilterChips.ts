import type { CreatureFacets, FacetOption } from '../../../../creatures/creatureFilterEngine';
import { clearFacet, LAYOUT_FACET, STATBLOCK_FACET, TEXT_FACET, withOptionState } from '../../../../creatures/creatureSelection';
import { formatRange } from '../../../../creatures/creatureValues';
import type { CreatureFilterDefinition, CreatureFilterSelection, OptionPicks } from '../../../../types/creatureFilterTypes';
import type { Tag } from '../types';
import { t } from '../../../../i18n';

type Update<T> = (update: (current: T) => T) => void;

export interface FilterChip {
  key: string;
  label: string;
  /** The value is excluded ("not beast"). */
  excluded: boolean;
  remove: () => void;
}

/** The active values of one filter: one chip, or a group that lists them. */
export interface FilterChipGroup {
  key: string;
  category: string;
  items: FilterChip[];
  removeAll: () => void;
}

interface ChipSources {
  selection: CreatureFilterSelection;
  definitions: readonly CreatureFilterDefinition[];
  facets: CreatureFacets | null;
  tagIds: readonly string[];
  tags: readonly Tag[];
  setSelection: Update<CreatureFilterSelection>;
  setTagIds: Update<string[]>;
}

/** The chips of an option facet: required values first, then the excluded ones. */
function pickChips(
  facet: string,
  picks: OptionPicks,
  options: readonly FacetOption[] | undefined,
  setSelection: Update<CreatureFilterSelection>,
): FilterChip[] {
  const labelOf = (key: string): string => options?.find((option) => option.key === key)?.label ?? key;
  const chip = (key: string, excluded: boolean): FilterChip => ({
    key,
    label: excluded ? `not ${labelOf(key)}` : labelOf(key),
    excluded,
    remove: () => setSelection((current) => withOptionState(current, facet, key, null)),
  });
  return [...picks.include.map((key) => chip(key, false)), ...picks.exclude.map((key) => chip(key, true))];
}

/** Every active filter as removable chips, in the order the filter panel lists them. */
export function activeFilterChips({ selection, definitions, facets, tagIds, tags, setSelection, setTagIds }: ChipSources): FilterChipGroup[] {
  const groups: FilterChipGroup[] = [];
  const clear = (facet: string) => (): void => setSelection((current) => clearFacet(current, facet));
  const addGroup = (key: string, category: string, items: FilterChip[]): void => {
    if (items.length > 0) groups.push({ key, category, items, removeAll: clear(key) });
  };

  if (selection.statblock !== 'any') {
    addGroup(STATBLOCK_FACET, t('filters.statblock'), [{
      key: selection.statblock,
      label: selection.statblock === 'linked' ? t('filters.withStatblock') : t('filters.withoutStatblock'),
      excluded: false,
      remove: clear(STATBLOCK_FACET),
    }]);
  }
  for (const definition of definitions) {
    if (definition.kind === 'range') {
      const range = selection.ranges[definition.id];
      if (range) addGroup(definition.id, definition.label, [{ key: 'range', label: formatRange(range), excluded: false, remove: clear(definition.id) }]);
      continue;
    }
    const picks = selection.options[definition.id];
    if (!picks) continue;
    const options = facets?.options.find((facet) => facet.definition.id === definition.id)?.options;
    addGroup(definition.id, definition.label, pickChips(definition.id, picks, options, setSelection));
  }
  addGroup(LAYOUT_FACET, t('filters.template'), pickChips(LAYOUT_FACET, selection.layouts, facets?.layouts, setSelection));
  addGroup(TEXT_FACET, t('filters.text'), pickChips(TEXT_FACET, selection.text, undefined, setSelection));
  if (tagIds.length > 0) {
    groups.push({
      key: 'tags',
      category: t('filters.tag'),
      items: tagIds.map((id) => ({
        key: id,
        label: tags.find((tag) => tag.id === id)?.name ?? id,
        excluded: false,
        remove: () => setTagIds((current) => current.filter((other) => other !== id)),
      })),
      removeAll: () => setTagIds(() => []),
    });
  }
  return groups;
}
