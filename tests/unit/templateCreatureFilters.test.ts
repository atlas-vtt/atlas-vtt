import { describe, expect, it } from 'vitest';
import { CATALOG_CREATURE_FILTERS } from '../../src/app/creatures/creatureFieldCatalog';
import { collectionCreatureFilters } from '../../src/app/creatures/creatureFilterDefinitions';
import { templateCreatureFilters } from '../../src/app/creatures/templateCreatureFilters';
import { builtInTemplate } from '../../src/app/statblocks/library/builtInTemplates';
import type { StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';

const fiveE = builtInTemplate('builtin:5e-2014-monster')?.template as StatblockTemplate;

describe('filters from statblock templates', () => {
  it('turn every number, rating, choice and list field into a filter, and category text by its meaning', () => {
    const filters = templateCreatureFilters([fiveE], CATALOG_CREATURE_FILTERS);
    const byId = new Map(filters.map((filter) => [filter.id, filter]));
    expect(byId.get('ac')).toEqual({ id: 'ac', label: 'Armor Class', kind: 'range', field: 'ac', origin: 'template' });
    expect(byId.get('hp')).toMatchObject({ kind: 'range', field: 'hp' });
    // Free text, dice, tables and abilities give none; fields the catalog reads are not repeated.
    for (const none of ['speed', 'languages', 'hit_dice', 'stats', 'actions', 'cr', 'type', 'alignment', 'name']) expect(byId.has(none)).toBe(false);
    expect(filters.every((filter) => filter.origin === 'template')).toBe(true);
  });

  it('give a field once, for the first template, and never one a filter of the collection reads', () => {
    const custom = { id: 'armour', label: 'Armour', kind: 'range' as const, field: 'ac' };
    const filters = templateCreatureFilters([fiveE, fiveE], [...CATALOG_CREATURE_FILTERS, custom]);
    expect(filters.some((filter) => filter.kind === 'range' && filter.field === 'ac')).toBe(false);
    expect(new Set(filters.map((filter) => filter.id)).size).toBe(filters.length);
  });

  it("come after the collection's own and can be switched off by id", () => {
    const all = collectionCreatureFilters({ hiddenCreatureFilters: ['hp'] }, [fiveE]);
    expect(all.slice(0, CATALOG_CREATURE_FILTERS.length)).toEqual(CATALOG_CREATURE_FILTERS);
    expect(all.some((filter) => filter.id === 'ac')).toBe(true);
    expect(all.some((filter) => filter.id === 'hp')).toBe(false);
  });
});
