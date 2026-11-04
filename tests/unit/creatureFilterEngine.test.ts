import { CATALOG_CREATURE_FILTERS } from '../../src/app/creatures/creatureFieldCatalog';
import { describe, expect, it } from 'vitest';
import { factsOf, type FilterableToken } from '../../src/app/creatures/creatureFacts';
import { evaluateCreatureFilters } from '../../src/app/creatures/creatureFilterEngine';
import type { IndexedCreature } from '../../src/app/creatures/CreatureIndex';
import {
  activeFilterCount, clearFacet, LAYOUT_FACET, pruneSelection, STATBLOCK_FACET, toggleExcludedOption, toggleOption, withOptionState, withRange, withStatblockFilter,
} from '../../src/app/creatures/creatureSelection';
import {
  emptyCreatureSelection,
  type CreatureFilterDefinition,
  type CreatureFilterSelection,
} from '../../src/app/types/creatureFilterTypes';

const DEFINITIONS: CreatureFilterDefinition[] = [
  { id: 'cr', label: 'CR', kind: 'range', field: 'cr' },
  { id: 'type', label: 'Type', kind: 'options', fields: ['type'] },
  { id: 'traits', label: 'Traits', kind: 'options', fields: ['trait_01', 'trait_02'] },
];

const CREATURES: Record<string, IndexedCreature> = {
  goblin: { path: 'goblin', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: '1/4', type: 'humanoid', trait_01: 'Goblinoid' } },
  wolf: { path: 'wolf', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: '1/4', type: 'Beast' } },
  bear: { path: 'bear', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: 1, type: 'beast' } },
  dragon: { path: 'dragon', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: 10, type: 'dragon', trait_01: 'Fire', trait_02: 'Evil' } },
  burrower: { path: 'burrower', templateId: null, meanings: {}, lookName: 'Daggerheart Adversary', fields: { tier: 1, type: 'Solo' } },
};

const TOKENS: FilterableToken[] = [
  { statblockPath: 'goblin' },
  { statblockPath: 'wolf' },
  { statblockPath: 'bear' },
  { statblockPath: 'dragon' },
  { statblockPath: 'burrower' },
  { statblockPath: 'missing-note' },
  {},
];

const lookup = (path: string): IndexedCreature | null => CREATURES[path] ?? null;
const facts = TOKENS.map((token) => factsOf(token, lookup, DEFINITIONS));
const names = ['goblin', 'wolf', 'bear', 'dragon', 'burrower', 'missing', 'plain'];

function shown(selection: CreatureFilterSelection): string[] {
  const { passes } = evaluateCreatureFilters(facts, DEFINITIONS, selection);
  return names.filter((_, index) => passes[index]);
}

const select = (...edits: Array<(selection: CreatureFilterSelection) => CreatureFilterSelection>): CreatureFilterSelection =>
  edits.reduce((selection, edit) => edit(selection), emptyCreatureSelection());

describe('evaluateCreatureFilters', () => {
  it('shows every token when nothing is picked', () => {
    expect(shown(emptyCreatureSelection())).toEqual(names);
  });

  it('keeps the tokens within a range and hides those whose statblock lacks the field', () => {
    const selection = select((s) => withRange(s, 'cr', { min: 0, max: 1 }));
    expect(shown(selection)).toEqual(['goblin', 'wolf', 'bear']);
    expect(evaluateCreatureFilters(facts, DEFINITIONS, selection).hidden).toEqual({
      withoutStatblock: 2,
      withoutField: [{ id: 'cr', label: 'CR', count: 1 }],
    });
  });

  it('treats options of one filter as alternatives and matches them regardless of case', () => {
    const selection = select((s) => toggleOption(s, 'type', 'beast'), (s) => toggleOption(s, 'type', 'dragon'));
    expect(shown(selection)).toEqual(['wolf', 'bear', 'dragon']);
  });

  it('merges the values of all fields of an options filter', () => {
    expect(shown(select((s) => toggleOption(s, 'traits', 'evil')))).toEqual(['dragon']);
  });

  it('narrows with every further filter', () => {
    const selection = select((s) => toggleOption(s, 'type', 'beast'), (s) => withRange(s, 'cr', { min: 1, max: 30 }));
    expect(shown(selection)).toEqual(['bear']);
  });

  it('does not count tokens hidden by a value as hidden for missing data', () => {
    const selection = select((s) => toggleOption(s, 'type', 'dragon'), (s) => withRange(s, 'cr', { min: 0, max: 1 }));
    expect(evaluateCreatureFilters(facts, DEFINITIONS, selection).hidden).toEqual({ withoutStatblock: 2, withoutField: [] });
  });

  it('filters by statblock link and layout', () => {
    expect(shown(select((s) => withStatblockFilter(s, 'unlinked')))).toEqual(['plain']);
    expect(shown(select((s) => withStatblockFilter(s, 'linked')))).toEqual(names.slice(0, 6));
    expect(shown(select((s) => toggleOption(s, LAYOUT_FACET, 'Daggerheart Adversary')))).toEqual(['burrower']);
  });

  it('counts each facet as if its own filter were off', () => {
    const { facets } = evaluateCreatureFilters(facts, DEFINITIONS, select((s) => toggleOption(s, 'type', 'beast')));
    const type = facets.options.find((facet) => facet.definition.id === 'type')!;
    expect(type.options.map((option) => [option.label, option.count, option.state])).toEqual([
      ['Beast', 2, 'include'], ['dragon', 1, null], ['humanoid', 1, null], ['Solo', 1, null],
    ]);
    const cr = facets.ranges.find((facet) => facet.definition.id === 'cr')!;
    expect(cr.values).toEqual([{ value: 0.25, count: 1 }, { value: 1, count: 1 }, { value: 10, count: 0 }]);
    expect(facets.statblock).toEqual({ any: 2, linked: 2, unlinked: 0 });
  });

  it('lists every layout in view', () => {
    const { facets } = evaluateCreatureFilters(facts, DEFINITIONS, emptyCreatureSelection());
    expect(facets.layouts.map((layout) => [layout.label, layout.count])).toEqual([['Basic 5e', 4], ['Daggerheart Adversary', 1]]);
  });

  it('keeps picked options that no token has, so they can be unpicked', () => {
    const { facets } = evaluateCreatureFilters(facts, DEFINITIONS, select((s) => toggleOption(s, 'type', 'ooze')));
    expect(facets.layouts.map((layout) => layout.count)).toEqual([0, 0]);
    const type = facets.options.find((facet) => facet.definition.id === 'type')!;
    expect(type.options.at(-1)).toEqual({ key: 'ooze', label: 'ooze', count: 0, state: 'include' });
  });

  it('hides tokens with an excluded value and keeps those without the field', () => {
    expect(shown(select((s) => toggleExcludedOption(s, 'type', 'beast')))).toEqual(['goblin', 'dragon', 'burrower', 'missing', 'plain']);
    const both = select((s) => toggleOption(s, 'type', 'beast'), (s) => toggleExcludedOption(s, 'traits', 'fire'));
    expect(shown(both)).toEqual(['wolf', 'bear']);
    expect(evaluateCreatureFilters(facts, DEFINITIONS, select((s) => toggleExcludedOption(s, 'type', 'beast'))).hidden)
      .toEqual({ withoutStatblock: 0, withoutField: [] });
  });

  it('marks excluded options and does not count tokens another exclusion hides', () => {
    const selection = select((s) => toggleExcludedOption(s, 'traits', 'fire'));
    const traits = evaluateCreatureFilters(facts, DEFINITIONS, selection).facets.options.find((facet) => facet.definition.id === 'traits')!;
    expect(traits.options.map((option) => [option.label, option.count, option.state])).toEqual([
      ['Evil', 0, null], ['Fire', 1, 'exclude'], ['Goblinoid', 1, null],
    ]);
  });

  it('filters thousands of tokens quickly', () => {
    const many = Array.from({ length: 5000 }, (_, index) => facts[index % facts.length]!);
    const selection = select((s) => withRange(s, 'cr', { min: 0, max: 5 }), (s) => toggleOption(s, 'type', 'beast'), (s) => withStatblockFilter(s, 'linked'));
    const start = performance.now();
    evaluateCreatureFilters(many, DEFINITIONS, selection);
    expect(performance.now() - start).toBeLessThan(250);
  });
});

describe('token facts', () => {
  it('rate a creature on the first scale its statblock has, so scales group together', () => {
    const rating = (fields: Record<string, unknown>) => factsOf({ statblockPath: 'x' }, () => ({ path: 'x', templateId: null, meanings: {}, lookName: null, fields }), []).rating;
    expect(rating({ cr: '1/2', level: 3 })).toEqual({ scale: 0, value: 0.5 });
    expect(rating({ level: 'Creature 3' })).toEqual({ scale: 1, value: 3 });
    expect(rating({ tier: 2 })).toEqual({ scale: 2, value: 2 });
    expect(rating({ type: 'beast' })).toBeNull();
    expect(factsOf({}, () => undefined, []).rating).toBeNull();
  });
});

describe('selection edits', () => {
  it('stops filtering a range that spans every value in view', () => {
    const selection = withRange(emptyCreatureSelection(), 'cr', { min: 0.25, max: 10 }, { min: 0.25, max: 10 });
    expect(selection.ranges).toEqual({});
  });

  it('cycles an option between required, excluded and nothing', () => {
    const included = toggleOption(emptyCreatureSelection(), 'type', 'beast');
    expect(included.options.type).toEqual({ include: ['beast'], exclude: [] });
    const excluded = toggleExcludedOption(included, 'type', 'beast');
    expect(excluded.options.type).toEqual({ include: [], exclude: ['beast'] });
    expect(toggleOption(excluded, 'type', 'beast').options).toEqual({});
    expect(withOptionState(excluded, 'type', 'beast', 'exclude')).toBe(excluded);
  });

  it('drops an options filter when its last option is unpicked', () => {
    const selection = toggleOption(toggleOption(emptyCreatureSelection(), 'type', 'beast'), 'type', 'beast');
    expect(selection.options).toEqual({});
  });

  it('counts and clears facets', () => {
    const selection = select((s) => withStatblockFilter(s, 'linked'), (s) => toggleOption(s, LAYOUT_FACET, 'Basic 5e'), (s) => withRange(s, 'cr', { min: 1, max: 2 }));
    expect(activeFilterCount(selection, DEFINITIONS)).toBe(3);
    expect(activeFilterCount(clearFacet(clearFacet(selection, 'cr'), STATBLOCK_FACET), DEFINITIONS)).toBe(1);
    expect(clearFacet(selection, LAYOUT_FACET).layouts).toEqual({ include: [], exclude: [] });
  });

  it('prunes picks of filters the collection no longer defines, keeping the object when nothing changes', () => {
    const selection = select((s) => withRange(s, 'cr', { min: 1, max: 2 }), (s) => toggleOption(s, 'role', 'solo'));
    const pruned = pruneSelection(selection, DEFINITIONS);
    expect(pruned.ranges).toEqual({ cr: { min: 1, max: 2 } });
    expect(pruned.options).toEqual({});
    expect(pruneSelection(pruned, DEFINITIONS)).toBe(pruned);
    const retyped: CreatureFilterDefinition[] = [{ id: 'cr', label: 'CR', kind: 'options', fields: ['cr'] }];
    expect(pruneSelection(pruned, retyped).ranges).toEqual({});
  });
});

describe('alignment', () => {
  const alignment = CATALOG_CREATURE_FILTERS.find((filter) => filter.id === 'alignment')!;
  const creatures: Record<string, IndexedCreature> = {
    orc: { path: 'orc', templateId: null, meanings: {}, lookName: null, fields: { alignment: 'chaotic evil' } },
    devil: { path: 'devil', templateId: null, meanings: {}, lookName: null, fields: { alignment: 'lawful evil' } },
    elf: { path: 'elf', templateId: null, meanings: {}, lookName: null, fields: { alignment: 'chaotic good' } },
    wolf: { path: 'wolf', templateId: null, meanings: {}, lookName: null, fields: { alignment: 'unaligned' } },
  };
  const alignmentFacts = Object.keys(creatures).map((path) => factsOf({ statblockPath: path }, (p) => creatures[p] ?? null, [alignment]));
  const evaluate = (selection: CreatureFilterSelection) => evaluateCreatureFilters(alignmentFacts, [alignment], selection);
  const names = (selection: CreatureFilterSelection): string[] => Object.keys(creatures).filter((_, index) => evaluate(selection).passes[index]);

  it('lists the parts of the alignments in their usual order', () => {
    expect(evaluate(emptyCreatureSelection()).facets.options[0]!.options.map((option) => [option.label, option.count])).toEqual([
      ['Lawful', 1], ['Chaotic', 2], ['Good', 1], ['Evil', 2], ['Unaligned', 1],
    ]);
  });

  it('needs every picked part, and counts what each further part would leave', () => {
    const chaoticEvil = select((s) => toggleOption(s, 'alignment', 'chaotic'), (s) => toggleOption(s, 'alignment', 'evil'));
    expect(names(chaoticEvil)).toEqual(['orc']);
    const chaotic = select((s) => toggleOption(s, 'alignment', 'chaotic'));
    expect(evaluate(chaotic).facets.options[0]!.options.map((option) => [option.label, option.count])).toEqual([
      ['Lawful', 0], ['Chaotic', 2], ['Good', 1], ['Evil', 1], ['Unaligned', 0],
    ]);
  });

  it('excludes a part', () => {
    expect(names(select((s) => toggleExcludedOption(s, 'alignment', 'evil')))).toEqual(['elf', 'wolf']);
  });
});
