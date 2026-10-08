import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GridMeasurementTab } from '../../src/app/react/components/collection-settings/GridMeasurementTab';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';

afterEach(cleanup);

const METRES: CollectionGridDefaults = { unitType: 'meters', unitDistance: 5, measurementMode: 'metric' };

/** The measurement tab over settings it edits, and the distance per square those hold. */
function openTab(initial: CollectionGridDefaults = METRES): { field: () => HTMLInputElement; stored: () => number; hint: () => HTMLElement | null } {
  let settings = initial;
  function Host(): React.ReactElement {
    const [gridDefaults, setGridDefaults] = React.useState(initial);
    settings = gridDefaults;
    return <GridMeasurementTab gridDefaults={gridDefaults} onChange={setGridDefaults} />;
  }
  render(<Host />);
  return {
    field: () => screen.getAllByRole<HTMLInputElement>('textbox')[0]!,
    stored: () => settings.unitDistance,
    hint: () => screen.queryByRole('alert'),
  };
}

/** Types `text` into `input` one character at a time, as a keyboard does. */
function type(input: HTMLInputElement, text: string): void {
  for (let length = 1; length <= text.length; length++) fireEvent.change(input, { target: { value: text.slice(0, length) } });
}

const marked = (input: HTMLInputElement): boolean => input.getAttribute('aria-invalid') === 'true';

describe('the distance per square of a collection', () => {
  it.each(['1,5', '1.5'])('takes %s as one and a half', (typed) => {
    const tab = openTab();
    type(tab.field(), typed);
    expect(tab.stored()).toBe(1.5);
    expect(tab.field().value).toBe(typed);
    expect(marked(tab.field())).toBe(false);
    expect(tab.hint()).toBeNull();
  });

  it('keeps the decimal sign while the number is being typed', () => {
    const tab = openTab();
    type(tab.field(), '2,');
    expect(tab.field().value).toBe('2,');
    expect(tab.stored()).toBe(2);
  });

  it('shows a distance as it is stored once the field is left', () => {
    const tab = openTab();
    type(tab.field(), '1,5');
    fireEvent.blur(tab.field());
    expect(tab.field().value).toBe('1.5');
  });

  it('takes a distance below 1, as a preset and a scene do', () => {
    const tab = openTab();
    type(tab.field(), '0,5');
    expect(tab.stored()).toBe(0.5);
    expect(marked(tab.field())).toBe(false);
  });

  it('shows the distance of a preset below 1 unmarked, and takes the same typed again', () => {
    const tab = openTab({ ...METRES, unitDistance: 0.5 });
    expect(tab.field().value).toBe('0.5');
    expect(marked(tab.field())).toBe(false);
    fireEvent.change(tab.field(), { target: { value: '' } });
    type(tab.field(), '0,5');
    expect(tab.stored()).toBe(0.5);
    expect(marked(tab.field())).toBe(false);
  });

  it.each(['', 'far', '0', '1e3', '9'.repeat(309), '1'.repeat(22)])('marks "%s" as no distance, says so and keeps the mark and the text when the field is left', (text) => {
    const tab = openTab();
    fireEvent.change(tab.field(), { target: { value: text } });
    fireEvent.blur(tab.field());
    expect(tab.stored()).toBeNaN();
    expect(tab.field().value).toBe(text);
    expect(marked(tab.field())).toBe(true);
    expect(tab.hint()?.textContent).toBe('Distance per Square needs a number from 0.000001 to 1,000,000.');
  });

  it('drops the mark once the text is a distance again', () => {
    const tab = openTab();
    fireEvent.change(tab.field(), { target: { value: 'far' } });
    fireEvent.blur(tab.field());
    type(tab.field(), '2.5');
    expect(tab.stored()).toBe(2.5);
    expect(marked(tab.field())).toBe(false);
    expect(tab.hint()).toBeNull();
  });

  it('shows an empty, marked field for settings that hold no distance', () => {
    const tab = openTab({ ...METRES, unitDistance: Infinity });
    expect(tab.field().value).toBe('');
    expect(marked(tab.field())).toBe(true);
  });
});
