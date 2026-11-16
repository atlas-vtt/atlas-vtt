// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import type { MovementRules } from '../../../src/app/measure/movementRules';
import { TokenSpeedField } from '../../../src/app/pixi/token-renderer/TokenSpeedField';
import { GridMeasurementTab } from '../../../src/app/react/components/collection-settings/GridMeasurementTab';
import type { CollectionGridDefaults } from '../../../src/app/types/collectionSettingsTypes';

afterEach(cleanup);

const STEPS: MovementRules = { steps: [{ name: 'Move', multiple: 1, color: '#22c55e' }, { name: 'Second move', multiple: 2, color: '#f59e0b' }], countPerTurn: true };
const FEET: CollectionGridDefaults = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' };
const BANDS: CollectionGridDefaults = {
  ...FEET, measurementMode: 'abstract',
  abstractRangeBands: [{ name: 'Close', maxSquares: 1 }, { name: 'Near', maxSquares: 6 }, { name: 'Double Near', maxSquares: 12 }, { name: 'Far', maxSquares: 13 }],
};
const SPEED = 'Speed of a creature that states none';

/** The Grid and measure tab over movement rules it edits. */
function openTab(gridDefaults: CollectionGridDefaults, initial: MovementRules): { stored: () => MovementRules; section: () => HTMLElement } {
  let rules = initial;
  function Host(): React.ReactElement {
    const [movement, setMovement] = React.useState(initial);
    rules = movement;
    return <GridMeasurementTab gridDefaults={gridDefaults} onChange={() => {}} movement={movement} onMovementChange={setMovement} />;
  }
  render(<Host />);
  return { stored: () => rules, section: () => screen.getByRole('region', { name: 'Movement' }) };
}

/** Opens the select named `name` and picks `option`. */
function pick(name: RegExp | string, option: string): void {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('the Movement group of a collection\'s settings', () => {
  it('shows where the collection measures distances and where it measures in range bands', () => {
    expect(within(openTab(FEET, STEPS).section()).getAllByPlaceholderText('Step')).toHaveLength(2);
    cleanup();
    expect(within(openTab(BANDS, STEPS).section()).getAllByPlaceholderText('Step')).toHaveLength(2);
  });

  it('takes the speed of a creature that states none as a number in the collection\'s unit', () => {
    const tab = openTab(FEET, STEPS);
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: `${SPEED} (ft)` });
    expect(field.value).toBe('');
    fireEvent.change(field, { target: { value: '30' } });
    expect(tab.stored()).toEqual({ ...STEPS, speed: 30 });
    expect(field.value).toBe('30');
    fireEvent.change(field, { target: { value: '' } });
    expect(tab.stored()).toEqual(STEPS);
    expect(tab.stored()).not.toHaveProperty('speed');
  });

  it('keeps a speed that is none as typed and says what is wrong with it', () => {
    const tab = openTab(FEET, { ...STEPS, speed: 30 });
    const field = screen.getByRole<HTMLInputElement>('spinbutton', { name: `${SPEED} (ft)` });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(field, { target: { value: '0' } });
    expect(tab.stored().speed).toBe(0);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('A speed is a number above 0.');
  });

  it('takes it as one of the collection\'s range bands, kept as that band\'s reach', () => {
    const tab = openTab(BANDS, STEPS);
    const select = (): HTMLElement => screen.getByRole('combobox', { name: SPEED });
    expect(select().textContent).toBe('None');
    fireEvent.click(select());
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['None', 'Close', 'Near', 'Double Near', 'Far']);
    fireEvent.click(screen.getByRole('option', { name: 'Near' }));
    // Six squares of 5 feet.
    expect(tab.stored()).toEqual({ ...STEPS, speed: 30 });
    expect(select().textContent).toBe('Near');
    pick(SPEED, 'None');
    expect(tab.stored()).toEqual(STEPS);
  });

  it('shows a speed that is no band\'s own as the band it reaches', () => {
    openTab(BANDS, { ...STEPS, speed: 40 });
    expect(screen.getByRole('combobox', { name: SPEED }).textContent).toBe('Double Near');
  });

  it('shows a third as three decimals and reads its decimals as the third', () => {
    const tab = openTab(FEET, { ...STEPS, steps: [{ ...STEPS.steps[0]!, multiple: 1 / 3 }, { ...STEPS.steps[1]!, multiple: 1 }] });
    const first = tab.section().querySelector<HTMLInputElement>('.atlas-csm-step-row input[type="number"]')!;
    expect(first.value).toBe('0.333');
    fireEvent.change(first, { target: { value: '0.67' } });
    expect(tab.stored().steps[0]!.multiple).toBe(2 / 3);
    fireEvent.change(first, { target: { value: '0.5' } });
    expect(tab.stored().steps[0]!.multiple).toBe(0.5);
  });
});

describe('a token\'s speed in Edit token', () => {
  const metric = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 } as MeasurementSettings;
  const bands = { ...metric, mode: 'abstract', rangeBands: BANDS.abstractRangeBands! } as MeasurementSettings;

  function openField(settings: MeasurementSettings, initial: string, extra: { defaultSpeed?: number; statblockSpeed?: number } = {}): () => string {
    let value = initial;
    function Host(): React.ReactElement {
      const [speed, setSpeed] = React.useState(initial);
      value = speed;
      return <TokenSpeedField value={speed} onChange={setSpeed} context={{ settings, defaultSpeed: extra.defaultSpeed }} statblockSpeed={extra.statblockSpeed} />;
    }
    render(<Host />);
    return () => value;
  }

  it('is a number in the map\'s unit, and says what the token moves by while it is empty', () => {
    openField(metric, '', { defaultSpeed: 30 });
    expect(screen.getByLabelText<HTMLInputElement>('Speed (ft)').placeholder).toBe('Default: 30');
    cleanup();
    openField(metric, '', { defaultSpeed: 30, statblockSpeed: 40 });
    expect(screen.getByLabelText<HTMLInputElement>('Speed (ft)').placeholder).toBe('Statblock default: 40');
    cleanup();
    openField(metric, '');
    expect(screen.getByLabelText<HTMLInputElement>('Speed (ft)').placeholder).toBe('None');
  });

  it('is one of the map\'s range bands where it names distances, kept as the band\'s reach', () => {
    const speed = openField(bands, '', { defaultSpeed: 30 });
    const select = (): HTMLElement => screen.getByRole('combobox', { name: 'Speed' });
    // Empty, the token follows the rules' speed, written as its band.
    expect(select().textContent).toBe('Default: Near');
    pick('Speed', 'Double Near');
    expect(speed()).toBe('60');
    expect(select().textContent).toBe('Double Near');
    pick('Speed', 'Default: Near');
    expect(speed()).toBe('');
  });

  it('names the statblock\'s speed as its band, and no speed at all as none', () => {
    openField(bands, '30', { statblockSpeed: 60 });
    fireEvent.click(screen.getByRole('combobox', { name: 'Speed' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Statblock default: Double Near', 'Close', 'Near', 'Double Near', 'Far']);
    expect(screen.getByRole('option', { name: 'Near' }).getAttribute('aria-selected')).toBe('true');
    cleanup();
    openField(bands, '');
    expect(screen.getByRole('combobox', { name: 'Speed' }).textContent).toBe('None');
  });

  it('stays a number on a map that names distances without any bands', () => {
    openField({ ...bands, rangeBands: [] }, '', { statblockSpeed: 30 });
    expect(screen.getByLabelText<HTMLInputElement>('Speed (ft)').placeholder).toBe('Statblock default: 30');
  });
});
