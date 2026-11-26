// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GridMeasurementTab } from '../../../src/app/react/components/collection-settings/GridMeasurementTab';
import type { CollectionGridDefaults } from '../../../src/app/types/collectionSettingsTypes';

afterEach(cleanup);

const CUSTOM: CollectionGridDefaults = { unitType: 'custom', unitDistance: 6, measurementMode: 'metric' };

/** The measurement tab over settings it edits, with its Unit name field where it has one. */
function openTab(initial: CollectionGridDefaults): { name: () => HTMLInputElement | null; stored: () => CollectionGridDefaults } {
  let settings = initial;
  function Host(): React.ReactElement {
    const [gridDefaults, setGridDefaults] = React.useState(initial);
    settings = gridDefaults;
    return <GridMeasurementTab gridDefaults={gridDefaults} onChange={setGridDefaults} />;
  }
  render(<Host />);
  return { name: () => screen.queryByRole<HTMLInputElement>('textbox', { name: 'Unit name' }), stored: () => settings };
}

describe('the name of a collection\'s custom unit', () => {
  it('is typed in a field only a custom unit has', () => {
    expect(openTab({ ...CUSTOM, unitType: 'feet', unitName: 'mi' }).name()).toBeNull();
    cleanup();
    const tab = openTab(CUSTOM);
    expect(tab.name()!.value).toBe('');
    fireEvent.change(tab.name()!, { target: { value: 'mi' } });
    expect(tab.stored()).toEqual({ ...CUSTOM, unitName: 'mi' });
    expect(tab.name()!.value).toBe('mi');
  });

  it('leaves no name behind once the field is emptied', () => {
    const tab = openTab({ ...CUSTOM, unitName: 'leagues' });
    expect(tab.name()!.value).toBe('leagues');
    fireEvent.change(tab.name()!, { target: { value: '' } });
    expect(tab.stored()).toEqual(CUSTOM);
  });
});
