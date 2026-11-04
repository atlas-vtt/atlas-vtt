// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RangeFilter } from '../../src/app/packages/components/asset-manager/components/search/RangeFilter';
import type { RangeFacet } from '../../src/app/creatures/creatureFilterEngine';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const facet = (selected: RangeFacet['selected'] = null): RangeFacet => ({
  definition: { id: 'hp', label: 'Hit Points', kind: 'range', field: 'hp' },
  values: [1, 3, 7, 59, 200].map((value) => ({ value, count: 1 })),
  selected,
});

function type(name: string, text: string): void {
  const input = screen.getByRole('textbox', { name });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
}

describe('the typed ends of a range filter', () => {
  it('show the bounds and snap a typed one to the nearest value the creatures have', () => {
    const onChange = vi.fn();
    render(<RangeFilter facet={facet()} onChange={onChange} />);
    expect(screen.getByRole('textbox', { name: 'Lowest Hit Points' })).toHaveProperty('value', '1');
    expect(screen.getByRole('textbox', { name: 'Highest Hit Points' })).toHaveProperty('value', '200');
    type('Lowest Hit Points', '5');
    expect(onChange).toHaveBeenLastCalledWith({ min: 7, max: 200 });
    type('Highest Hit Points', '100');
    expect(onChange).toHaveBeenLastCalledWith({ min: 1, max: 59 });
  });

  it('move the other end along when a bound passes it, and ignore what reads as no number', () => {
    const onChange = vi.fn();
    render(<RangeFilter facet={facet({ min: 3, max: 7 })} onChange={onChange} />);
    type('Lowest Hit Points', '50');
    expect(onChange).toHaveBeenLastCalledWith({ min: 59, max: 59 });
    onChange.mockClear();
    type('Highest Hit Points', 'lots');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Highest Hit Points' })).toHaveProperty('value', '7');
  });
});
