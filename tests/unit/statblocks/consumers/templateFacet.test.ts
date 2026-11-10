import { describe, expect, it, vi } from 'vitest';
import { CATALOG_CREATURE_FILTERS } from '../../../../src/app/creatures/creatureFieldCatalog';
import { factsOf } from '../../../../src/app/creatures/creatureFacts';
import { evaluateCreatureFilters } from '../../../../src/app/creatures/creatureFilterEngine';
import { LAYOUT_FACET, toggleOption } from '../../../../src/app/creatures/creatureSelection';
import type { IndexedCreature } from '../../../../src/app/creatures/CreatureIndex';
import { keywordLookup, parseQuery } from '../../../../src/app/search/querySyntax';
import { activeFilterChips } from '../../../../src/app/packages/components/asset-manager/search/activeFilterChips';
import { applyFilterTokens } from '../../../../src/app/packages/components/asset-manager/search/applyFilterTokens';
import { filterKeywords } from '../../../../src/app/packages/components/asset-manager/search/filterKeywords';
import { filterSuggestions } from '../../../../src/app/packages/components/asset-manager/search/filterSuggestions';
import { emptyCreatureSelection, type CreatureFilterSelection } from '../../../../src/app/types/creatureFilterTypes';

/** Two statblocks drawn by a native template and one by a Fantasy Statblocks layout of the same name. */
const CREATURES: Record<string, IndexedCreature> = {
  warden: { path: 'warden', templateId: 'marsh-creature-k7m2qa', meanings: { rating: 'cr' }, lookName: 'Marsh creature', fields: { cr: 2, type: 'plant' } },
  hag: { path: 'hag', templateId: 'marsh-creature-k7m2qa', meanings: { rating: 'cr' }, lookName: 'Marsh creature', fields: { cr: 5, type: 'fey' } },
  toad: { path: 'toad', templateId: null, meanings: {}, lookName: 'Marsh creature', fields: { cr: 1, type: 'beast' } },
  goblin: { path: 'goblin', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: '1/4', type: 'humanoid' } },
};
const NAMES = Object.keys(CREATURES);
const facts = NAMES.map((path) => factsOf({ statblockPath: path }, (p) => CREATURES[p] ?? null, CATALOG_CREATURE_FILTERS));
const evaluate = (selection: CreatureFilterSelection) => evaluateCreatureFilters(facts, CATALOG_CREATURE_FILTERS, selection);
const shown = (selection: CreatureFilterSelection): string[] => NAMES.filter((_, index) => evaluate(selection).passes[index]);
const { facets } = evaluate(emptyCreatureSelection());
const keywords = filterKeywords('tokens', CATALOG_CREATURE_FILTERS);
const lookup = keywordLookup(keywords);

function typed(text: string): CreatureFilterSelection {
  const { tokens } = parseQuery(text, lookup);
  return applyFilterTokens(text, tokens, { selection: emptyCreatureSelection(), tagIds: [] }, { facets, tags: [] }).filters.selection;
}

describe('the "Template" facet', () => {
  it('keeps a Fantasy Statblocks layout and a native template of one name apart', () => {
    expect(facets.layouts.map((option) => [option.label, option.count])).toEqual([['Marsh creature', 2], ['Basic 5e', 1], ['Marsh creature', 1]]);
    const [native, , fantasy] = facets.layouts;
    expect(native!.key).not.toBe(fantasy!.key);
    expect(shown(toggleOption(emptyCreatureSelection(), LAYOUT_FACET, native!.key))).toEqual(['warden', 'hag']);
    expect(shown(toggleOption(emptyCreatureSelection(), LAYOUT_FACET, fantasy!.key))).toEqual(['toad']);
  });

  it('filters by name with `template:`, and still with `layout:`', () => {
    expect(shown(typed('template:"marsh creature"'))).toEqual(['warden', 'hag', 'toad']);
    expect(shown(typed('layout:"Basic 5e"'))).toEqual(['goblin']);
    expect(shown(typed('-template:"Marsh creature"'))).toEqual(['goblin']);
  });

  it('offers each name once as a value to type, with the count of both', () => {
    expect(filterSuggestions('template:', 9, { keywords, lookup, facets, tags: [] })?.items).toEqual([
      { kind: 'value', label: 'Marsh creature', insert: '"Marsh creature"', count: 3 },
      { kind: 'value', label: 'Basic 5e', insert: '"Basic 5e"', count: 1 },
    ]);
  });

  it('shows a picked template as a chip under "Template", named after it even while no token in view has it', () => {
    const selection = typed('template:"marsh creature"');
    const groups = activeFilterChips({ selection, definitions: CATALOG_CREATURE_FILTERS, facets, tagIds: [], tags: [], setSelection: vi.fn(), setTagIds: vi.fn() });
    expect(groups.map((group) => [group.category, group.items.map((item) => item.label)])).toEqual([['Template', ['Marsh creature', 'Marsh creature']]]);

    const away = evaluateCreatureFilters([], CATALOG_CREATURE_FILTERS, selection).facets.layouts;
    expect(away.map((option) => option.label)).toEqual(['Marsh creature', 'Marsh creature']);
  });
});
