import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GridMeasurementTab } from '../../src/app/react/components/collection-settings/GridMeasurementTab';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';

afterEach(cleanup);

const METRES: CollectionGridDefaults = { unitType: 'meters', unitDistance: 5, measurementMode: 'metric' };

/** The measurement tab over settings it edits, and the distance per square those hold. */
function openTab(): { field: () => HTMLInputElement; stored: () => number } {
  let settings = METRES;
  function Host(): React.ReactElement {
    const [gridDefaults, setGridDefaults] = React.useState(METRES);
    settings = gridDefaults;
    return <GridMeasurementTab gridDefaults={gridDefaults} onChange={setGridDefaults} />;
  }
  render(<Host />);
  return { field: () => screen.getAllByRole<HTMLInputElement>('textbox')[0]!, stored: () => settings.unitDistance };
}

/** Types `text` into `input` one character at a time, as a keyboard does. */
function type(input: HTMLInputElement, text: string): void {
  for (let length = 1; length <= text.length; length++) fireEvent.change(input, { target: { value: text.slice(0, length) } });
}

describe('the distance per square of a collection', () => {
  it.each(['1,5', '1.5'])('takes %s as one and a half', (typed) => {
    const tab = openTab();
    type(tab.field(), typed);
    expect(tab.stored()).toBe(1.5);
    expect(tab.field().value).toBe(typed);
    expect(tab.field().getAttribute('aria-invalid')).toBeNull();
  });

  it('keeps the decimal sign while the number is being typed', () => {
    const tab = openTab();
    type(tab.field(), '2,');
    expect(tab.field().value).toBe('2,');
    expect(tab.stored()).toBe(2);
  });

  it('keeps the last distance for text that is none, marks the field and shows the distance again on leaving', () => {
    const tab = openTab();
    for (const text of ['', 'far', '0,5', '0']) {
      fireEvent.change(tab.field(), { target: { value: text } });
      expect(tab.stored()).toBe(5);
      expect(tab.field().getAttribute('aria-invalid')).toBe('true');
    }
    fireEvent.blur(tab.field());
    expect(tab.field().value).toBe('5');
    expect(tab.field().getAttribute('aria-invalid')).toBeNull();
  });

  it('shows the stored distance after a decimal was typed and the field left', () => {
    const tab = openTab();
    type(tab.field(), '1,5');
    fireEvent.blur(tab.field());
    expect(tab.field().value).toBe('1.5');
  });
});
