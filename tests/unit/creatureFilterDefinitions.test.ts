import { describe, expect, it } from 'vitest';
import { CATALOG_CREATURE_FILTERS, RATING_FILTERS } from '../../src/app/creatures/creatureFieldCatalog';
import {
  collectionCreatureFilters,
  fieldLabel,
  filterForField,
  isCompleteCreatureFilter,
  newCreatureFilterId,
  parseCreatureFilters,
  parseHiddenCreatureFilters,
  withFilterKind,
} from '../../src/app/creatures/creatureFilterDefinitions';
import type { CreatureFilterDefinition } from '../../src/app/types/creatureFilterTypes';

describe('the catalog of creature filters', () => {
  it('names the fields statblocks of every system share, with labels that fit any system', () => {
    expect(CATALOG_CREATURE_FILTERS.map((filter) => filter.label)).toEqual([
      'Challenge rating', 'Level', 'Tier', 'Type', 'Traits', 'Rarity', 'Alignment', 'Source',
    ]);
    expect(new Set(CATALOG_CREATURE_FILTERS.map((filter) => filter.id)).size).toBe(CATALOG_CREATURE_FILTERS.length);
  });

  it('rates creatures by challenge rating, then level, then tier', () => {
    expect(RATING_FILTERS.map((filter) => filter.field)).toEqual(['cr', 'level', 'tier']);
  });

  it('reads Pathfinder traits from both of its layouts', () => {
    const traits = CATALOG_CREATURE_FILTERS.find((filter) => filter.id === 'traits');
    expect(traits).toMatchObject({ kind: 'options', fields: expect.arrayContaining(['traits', 'trait_01', 'trait_07']) });
  });
});

describe('collectionCreatureFilters', () => {
  const hd: CreatureFilterDefinition = { id: 'hit-dice', label: 'Hit dice', kind: 'range', field: 'hit_dice' };

  it('offers the whole catalog to a collection that changed nothing', () => {
    expect(collectionCreatureFilters({})).toEqual(CATALOG_CREATURE_FILTERS);
  });

  it('leaves out the catalog filters a collection switched off and adds its own after the rest', () => {
    const filters = collectionCreatureFilters({ hiddenCreatureFilters: ['source', 'traits'], customCreatureFilters: [hd] });
    expect(filters.map((filter) => filter.id)).toEqual(['cr', 'level', 'tier', 'type', 'rarity', 'alignment', 'hit-dice']);
  });

  it('never lets a collection filter take a catalog id', () => {
    const clash: CreatureFilterDefinition = { id: 'cr', label: 'Mine', kind: 'range', field: 'challenge' };
    expect(collectionCreatureFilters({ customCreatureFilters: [clash] }).filter((filter) => filter.id === 'cr')).toHaveLength(1);
  });
});

describe('parsing stored filters', () => {
  it('keeps usable filters and leaves out the rest', () => {
    expect(parseCreatureFilters([
      { id: 'hd', label: ' HD ', kind: 'range', field: 'hit_dice' },
      { id: 'kind', label: '', kind: 'options', fields: ['kind', ' kind ', '', 3] },
      { id: 'hd', label: 'Duplicate', kind: 'range', field: 'level' },
      { id: 'future', label: 'Future', kind: 'formula', expression: 'cr * 2' },
      { id: 'nofield', label: 'No field', kind: 'range', field: ' ' },
      { label: 'No id', kind: 'range', field: 'cr' },
      'junk',
    ])).toEqual([
      { id: 'hd', label: 'HD', kind: 'range', field: 'hit_dice' },
      { id: 'kind', label: 'kind', kind: 'options', fields: ['kind'] },
    ]);
    expect(parseCreatureFilters(undefined)).toEqual([]);
  });

  it('keeps every id among the switched-off filters, a template field\'s too, each once', () => {
    expect(parseHiddenCreatureFilters(['source', 'source', 'ac', ' ', 3])).toEqual(['source', 'ac']);
    expect(parseHiddenCreatureFilters('source')).toEqual([]);
  });
});

describe('editing filters', () => {
  it('derives a free id and a label from the field', () => {
    expect(newCreatureFilterId(CATALOG_CREATURE_FILTERS, 'type')).toBe('type-2');
    expect(newCreatureFilterId([], '???')).toBe('filter');
    expect(fieldLabel('hd')).toBe('HD');
    expect(fieldLabel('hit_dice')).toBe('Hit dice');
    expect(filterForField([], 'groessetyp', 'options')).toEqual({ id: 'groessetyp', label: 'Groessetyp', kind: 'options', fields: ['groessetyp'] });
  });

  it('switches kind keeping the first field, and needs a field to be complete', () => {
    const options: CreatureFilterDefinition = { id: 'x', label: 'X', kind: 'options', fields: ['a', 'b'] };
    expect(withFilterKind(options, 'range')).toEqual({ id: 'x', label: 'X', kind: 'range', field: 'a' });
    expect(isCompleteCreatureFilter({ id: 'y', label: '', kind: 'range', field: ' ' })).toBe(false);
  });
});
