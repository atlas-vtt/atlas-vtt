import { describe, expect, it, vi } from 'vitest';
import { CATALOG_CREATURE_FILTERS } from '../../src/app/creatures/creatureFieldCatalog';
import { factsOf } from '../../src/app/creatures/creatureFacts';
import { evaluateCreatureFilters } from '../../src/app/creatures/creatureFilterEngine';
import { formatRange, formatRating } from '../../src/app/creatures/creatureValues';
import type { IndexedCreature } from '../../src/app/creatures/CreatureIndex';
import { keywordLookup, parseQuery } from '../../src/app/search/querySyntax';
import { activeFilterChips } from '../../src/app/packages/components/asset-manager/search/activeFilterChips';
import { applyFilterTokens } from '../../src/app/packages/components/asset-manager/search/applyFilterTokens';
import { filterKeywords, rangeValue, statblockValue } from '../../src/app/packages/components/asset-manager/search/filterKeywords';
import { filterSuggestions } from '../../src/app/packages/components/asset-manager/search/filterSuggestions';
import { emptyCreatureSelection, type CreatureFilterSelection } from '../../src/app/types/creatureFilterTypes';

const CREATURES: Record<string, IndexedCreature> = {
  goblin: { path: 'goblin', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: '1/4', type: 'humanoid', source: 'Monster Manual' } },
  wolf: { path: 'wolf', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: '1/4', type: 'beast' } },
  bear: { path: 'bear', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: 1, type: 'Beast' } },
  dragon: { path: 'dragon', templateId: null, meanings: {}, lookName: 'Basic 5e', fields: { cr: 10, type: 'dragon' } },
};
const facts = [...Object.keys(CREATURES), 'plain'].map((path) => factsOf(path === 'plain' ? {} : { statblockPath: path }, (p) => CREATURES[p] ?? null, CATALOG_CREATURE_FILTERS));
const { facets } = evaluateCreatureFilters(facts, CATALOG_CREATURE_FILTERS, emptyCreatureSelection());
const tags = [{ id: 'forest-id', name: 'Forest' }, { id: 'boss', name: 'Boss fight' }];
const keywords = filterKeywords('tokens', CATALOG_CREATURE_FILTERS);
const lookup = keywordLookup(keywords);
const sources = { keywords, lookup, facets, tags };

function apply(text: string, selection: CreatureFilterSelection = emptyCreatureSelection()) {
  const { tokens, leftover } = parseQuery(text, lookup);
  const result = applyFilterTokens(text, tokens, { selection, tagIds: [] }, { facets, tags });
  return { ...result, leftover };
}

describe('keywords', () => {
  it('offer name and tag everywhere and the statblock fields on the Characters tab', () => {
    expect(filterKeywords('maps', CATALOG_CREATURE_FILTERS).map((keyword) => keyword.prefix)).toEqual(['name', 'tag']);
    expect(keywords.map((keyword) => keyword.prefix)).toEqual([
      'name', 'tag', 'statblock', 'cr', 'level', 'tier', 'type', 'trait', 'rarity', 'alignment', 'source', 'template', 'text',
    ]);
  });

  it('give a collection filter its id as prefix unless that is taken', () => {
    const custom = filterKeywords('tokens', [
      { id: 'hit-dice', label: 'Hit dice', kind: 'range', field: 'hit_dice' },
      { id: 'tag', label: 'Clash', kind: 'options', fields: ['tag'] },
    ]);
    expect(custom.map((keyword) => keyword.prefix)).toEqual(['name', 'tag', 'statblock', 'hit-dice', 'template', 'text']);
  });

  it('read ranges and statblock choices as typed', () => {
    expect(rangeValue('1/4')).toEqual({ min: 0.25, max: 0.25 });
    expect(rangeValue('3-1')).toEqual({ min: 1, max: 3 });
    expect(rangeValue('1/4..2')).toEqual({ min: 0.25, max: 2 });
    expect(rangeValue('-1')).toEqual({ min: -1, max: -1 });
    expect(rangeValue('high')).toBeNull();
    expect(statblockValue('Yes')).toBe('linked');
    expect(statblockValue('maybe')).toBeNull();
  });
});

describe('suggestions', () => {
  it('list the keywords whose values the characters in view have', () => {
    const suggestions = filterSuggestions('', 0, sources);
    expect(suggestions?.items.map((item) => (item.kind === 'keyword' ? item.keyword.prefix : ''))).toEqual([
      'name', 'tag', 'statblock', 'cr', 'type', 'source', 'text',
    ]);
  });

  it('stay out of the way of a plain name search', () => {
    expect(filterSuggestions('gob', 3, sources)).toBeNull();
  });

  it('offer the keywords that can exclude after a minus', () => {
    const suggestions = filterSuggestions('-t', 2, sources);
    expect(suggestions?.heading).toBe('Exclude');
    expect(suggestions?.items.map((item) => (item.kind === 'keyword' ? [item.keyword.prefix, item.negated] : null))).toEqual([['type', true], ['trait', true], ['template', true], ['text', true]]);
    expect(filterSuggestions('-type:', 6, sources)?.heading).toBe('Exclude type');
  });

  it('list values with counts after a keyword', () => {
    const typeValues = filterSuggestions('t:b', 3, sources);
    expect(typeValues).toMatchObject({ mode: 'value', heading: 'Type', items: [{ label: 'beast', count: 2, insert: 'beast' }] });
    expect(filterSuggestions('source:', 7, sources)?.items).toEqual([{ kind: 'value', label: 'Monster Manual', insert: '"Monster Manual"', count: 1 }]);
    expect(filterSuggestions('cr:1', 4, sources)?.items.map((item) => (item.kind === 'value' ? item.label : ''))).toEqual(['1', '1/4', '10']);
    expect(filterSuggestions('cr:', 3, sources)?.hint).toMatch(/cr:1-3/);
    expect(filterSuggestions('tag:bo', 6, sources)?.items).toEqual([{ kind: 'value', label: 'Boss fight', insert: '"Boss fight"' }]);
  });
});

describe('applying typed filters', () => {
  it('turns tokens into filters and keeps the plain words as the search', () => {
    const { filters, words, leftover } = apply('red t:beast name:wolf tag:forest statblock:yes');
    expect(filters.selection.options).toEqual({ type: { include: ['beast'], exclude: [] } });
    expect(filters.selection.statblock).toBe('linked');
    expect(filters.tagIds).toEqual(['forest-id']);
    expect([...words, leftover]).toEqual(['wolf', 'red']);
  });

  it('keeps a tag that does not exist as typed', () => {
    expect(apply('tag:swamp').words).toEqual(['tag:swamp']);
  });

  it('reads comparisons against the values in view', () => {
    expect(apply('cr:1/4-1').filters.selection.ranges.cr).toEqual({ min: 0.25, max: 1 });
    expect(apply('cr>=1').filters.selection.ranges.cr).toEqual({ min: 1, max: Infinity });
    expect(apply('cr<1').filters.selection.ranges.cr).toEqual({ min: -Infinity, max: 0.25 });
    expect(apply('cr>1').filters.selection.ranges.cr).toEqual({ min: 10, max: Infinity });
  });

  it('excludes options and layouts typed with a minus or !=', () => {
    expect(apply('-type:beast source!="Monster Manual"').filters.selection.options).toEqual({
      type: { include: [], exclude: ['beast'] },
      source: { include: [], exclude: ['monster manual'] },
    });
    expect(apply('-layout:"basic 5e"').filters.selection.layouts).toEqual({ include: [], exclude: ['Basic 5e'] });
    expect(apply('-cr:1 -tag:forest').words).toEqual([]);
    expect(apply('-cr:1 -tag:forest').leftover).toBe('');
  });

  it('adds to what is picked instead of toggling', () => {
    const once = apply('type:beast').filters.selection;
    expect(apply('type:BEAST type:dragon', once).filters.selection.options).toEqual({ type: { include: ['beast', 'dragon'], exclude: [] } });
  });
});

describe('active filter chips', () => {
  it('list every active filter with a way to remove it', () => {
    const setSelection = vi.fn();
    const setTagIds = vi.fn();
    const selection = apply('t:beast -t:dragon cr>=1 sb:no layout:"basic 5e"').filters.selection;
    const groups = activeFilterChips({ selection, definitions: CATALOG_CREATURE_FILTERS, facets, tagIds: ['forest-id'], tags, setSelection, setTagIds });
    expect(groups.map((group) => [group.category, group.items.map((item) => item.label)])).toEqual([
      ['Statblock', ['Without statblock']],
      ['Challenge rating', ['≥ 1']],
      ['Type', ['beast', 'not dragon']],
      ['Template', ['Basic 5e']],
      ['Tag', ['Forest']],
    ]);
    groups[2]!.items[0]!.remove();
    expect(setSelection.mock.calls[0]![0](selection).options).toEqual({ type: { include: [], exclude: ['dragon'] } });
    groups[4]!.removeAll();
    expect(setTagIds.mock.calls[0]![0](['forest-id'])).toEqual([]);
  });

  it('format open and closed ranges', () => {
    expect(formatRange({ min: -Infinity, max: 2 })).toBe('≤ 2');
    expect(formatRange({ min: 0.25, max: 3 })).toBe('1/4 – 3');
    expect(formatRange({ min: 5, max: 5 })).toBe('5');
    expect(formatRating(2 + 1e-12)).toBe('2');
  });
});

describe('statblock text', () => {
  const creatures: Record<string, IndexedCreature> = {
    hound: { path: 'hound', templateId: null, meanings: {}, lookName: null, fields: { name: 'Hell Hound', actions: [{ name: 'Fire Breath', desc: 'Exhales [[fire]] in a 15-foot cone.' }] } },
    wolf: { path: 'wolf', templateId: null, meanings: {}, lookName: null, fields: { name: 'Wolf', traits: [{ name: 'Pack Tactics', desc: 'Advantage on attacks.' }] } },
  };
  const textFacts = ['hound', 'wolf', 'plain'].map((path) => factsOf(path === 'plain' ? {} : { statblockPath: path }, (p) => creatures[p] ?? null, []));
  const passing = (selection: CreatureFilterSelection): boolean[] => [...evaluateCreatureFilters(textFacts, [], selection).passes];

  it('takes text: phrases out of the search, in lowercase', () => {
    const { filters, leftover } = apply('wolf text:"Pack  Tactics" -has:fire');
    expect(filters.selection.text).toEqual({ include: ['pack tactics'], exclude: ['fire'] });
    expect(leftover).toBe('wolf');
  });

  it('finds a phrase anywhere in a statblock, ability names and linked words alike, and excludes it', () => {
    expect(passing(apply('text:fire').filters.selection)).toEqual([true, false, false]);
    expect(passing(apply('text:"pack tactics"').filters.selection)).toEqual([false, true, false]);
    expect(passing(apply('-text:fire').filters.selection)).toEqual([false, true, true]);
  });
});

describe('statblock text as a phrase', () => {
  it('reads unquoted words after text: up to the next keyword', () => {
    const { filters, leftover } = apply('text:pack   tactics type:beast');
    expect(filters.selection.text.include).toEqual(['pack tactics']);
    expect(filters.selection.options.type?.include).toEqual(['beast']);
    expect(leftover).toBe('');
  });

  it('keeps every word of the phrase, a trailing space included, in the value, so Enter applies it', () => {
    for (const text of ['text:pack t', 'text:pack tactics ']) {
      const suggestions = filterSuggestions(text, text.length, sources);
      expect(suggestions?.mode).toBe('value');
      expect(suggestions?.items).toEqual([]);
    }
  });
});
