import { describe, expect, it } from 'vitest';
import { SHOWN_OPTIONS, shownOptions } from '../../src/app/packages/components/asset-manager/components/search/OptionFilter';
import type { FacetOption } from '../../src/app/creatures/creatureFilterEngine';

const option = (label: string, state: FacetOption['state'] = null): FacetOption => ({ key: label.toLowerCase(), label, count: 1, state });
const many = Array.from({ length: 20 }, (_, i) => option(`Type ${i}`));

describe('the options an options filter shows', () => {
  it('shows the first few, and every picked one besides', () => {
    const picked = [...many.slice(0, 19), option('Rare', 'exclude')];
    const shown = shownOptions(picked, '');
    expect(shown).toHaveLength(SHOWN_OPTIONS + 1);
    expect(shown.at(-1)?.label).toBe('Rare');
  });

  it('searches every option by its label, case aside, with the picked ones kept', () => {
    const options = [...many, option('Beast'), option('Undead', 'include')];
    expect(shownOptions(options, 'BEA').map((o) => o.label)).toEqual(['Beast', 'Undead']);
    expect(shownOptions(options, 'type 1').map((o) => o.label)).toEqual(['Type 1', ...many.slice(10, 17).map((o) => o.label), 'Undead']);
  });
});
