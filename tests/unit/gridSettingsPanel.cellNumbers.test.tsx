// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { GridState } from '../../src/app/types/gridTypes';
import { fakeGridView, renderGridPanel } from '../helpers/gridSettingsPanel';

afterEach(() => cleanup());

const baseGrid: GridState = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.7 };

describe('GridSettingsPanel cell numbers', () => {
  it('shows the Cell numbers row on a square grid', () => {
    renderGridPanel(fakeGridView({ ...baseGrid, type: 'square' }));
    expect(screen.getByText('Cell numbers')).toBeTruthy();
  });

  it('hides the number-opacity row until a format is chosen', () => {
    renderGridPanel(fakeGridView({ ...baseGrid, type: 'square' }));
    expect(screen.queryByText('Number opacity')).toBeNull();
  });

  it('shows the number-opacity row once a format is chosen', () => {
    renderGridPanel(fakeGridView({ ...baseGrid, type: 'square', cellNumbers: 'column-row' }));
    expect(screen.getByText('Number opacity')).toBeTruthy();
  });
});

// #84: a map outside every collection measures as its grid says; measured in units here.
describe('GridSettingsPanel distance per cell', () => {
  const metricGrid: GridState = { ...baseGrid, measurementType: 'units', unitType: 'feet', unitDistance: 5 };
  const field = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Distance per cell in ft' });

  it('overrides the distance on leaving the field and follows the default again when emptied', () => {
    const view = fakeGridView(metricGrid);
    renderGridPanel(view);
    expect(field().placeholder).toBe('5');

    fireEvent.change(field(), { target: { value: '7,5' } });
    fireEvent.blur(field());
    expect(view.atlasStore.getState().grid?.unitDistanceOverride).toBe(7.5);

    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(view.atlasStore.getState().grid).not.toHaveProperty('unitDistanceOverride');
  });

  it('puts the stored distance back for text that is no positive number', () => {
    const view = fakeGridView({ ...metricGrid, unitDistanceOverride: 50 });
    renderGridPanel(view);
    for (const typed of ['-3', '0', '10 ft', '1 mile', 'abc']) {
      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: typed } });
      fireEvent.blur(field());
      expect(view.atlasStore.getState().grid?.unitDistanceOverride).toBe(50);
      expect(field().value).toBe('50');
    }
  });

  it('follows the stored distance when it changes elsewhere (undo, another view) while the field is not edited', () => {
    const view = fakeGridView({ ...metricGrid, unitDistanceOverride: 50 });
    renderGridPanel(view);
    expect(field().value).toBe('50');
    act(() => view.atlasStore.getState().setGrid(metricGrid));
    expect(field().value).toBe('');
    act(() => view.atlasStore.getState().setGrid({ ...metricGrid, unitDistanceOverride: 20 }));
    expect(field().value).toBe('20');
  });

  it("names the grid's distance, not a collection's, on a map outside every collection", () => {
    renderGridPanel(fakeGridView(metricGrid));
    expect(screen.getByText("Empty uses the grid's 5 ft")).toBeTruthy();
  });

  it('is not offered where distances are range bands', () => {
    renderGridPanel(fakeGridView(baseGrid));
    expect(screen.queryByRole('textbox', { name: /Distance per cell/ })).toBeNull();
  });
});

// A GM measuring in metres: the unit is set where the map's rules come from, here the map's own grid.
describe('GridSettingsPanel unit', () => {
  const metricGrid: GridState = { ...baseGrid, measurementType: 'units', unitType: 'feet', unitDistance: 5 };
  const unit = (): HTMLElement => screen.getByRole('button', { name: 'Feet' });

  it('sets the unit of a map outside every collection on its grid, and the distance row follows it', async () => {
    const view = fakeGridView(metricGrid);
    renderGridPanel(view);
    expect(screen.getByText('For this scene')).toBeTruthy();

    fireEvent.keyDown(unit(), { key: 'Enter' });
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Custom' })).toBeNull();
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Meters' }));
    expect(view.atlasStore.getState().grid?.unitType).toBe('meters');
    expect(screen.getByRole('button', { name: 'Meters' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Distance per cell in m' })).toBeTruthy();
  });

  it('is not offered where distances are range bands', () => {
    renderGridPanel(fakeGridView(baseGrid));
    expect(screen.queryByText('For this scene')).toBeNull();
  });
});
