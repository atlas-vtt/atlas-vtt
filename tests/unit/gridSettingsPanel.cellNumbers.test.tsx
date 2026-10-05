import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { GridSettingsPanel } from '../../src/app/react/components/command-palette/GridSettingsPanel';
import type { GridState } from '../../src/app/types/gridTypes';
import type { AtlasView } from '../../src/app/atlas-view';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => cleanup());

function fakeView(grid: GridState | null): AtlasView {
  const store = create<{ grid: GridState | null; mapPath: string | null; setGrid: (grid: GridState) => void }>((set) => ({
    grid,
    mapPath: null,
    setGrid: (next) => set({ grid: next }),
  }));
  return { atlasStore: store, app: createInMemoryApp().app } as unknown as AtlasView;
}

const baseGrid: GridState = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.7 };

function renderPanel(view: AtlasView): void {
  render(
    <GridSettingsPanel
      view={view}
      localOpacity={0.7}
      setLocalOpacity={vi.fn()}
      localLineWidth={1}
      setLocalLineWidth={vi.fn()}
      localGridVisible
      setLocalGridVisible={vi.fn()}
      localSnapToGrid
      setLocalSnapToGrid={vi.fn()}
      debouncedOpacityUpdate={vi.fn()}
      debouncedLineWidthUpdate={vi.fn()}
    />,
  );
}

describe('GridSettingsPanel cell numbers', () => {
  it('shows the Cell numbers row on a square grid', () => {
    renderPanel(fakeView({ ...baseGrid, type: 'square' }));
    expect(screen.getByText('Cell numbers')).toBeTruthy();
  });

  it('hides the number-opacity row until a format is chosen', () => {
    renderPanel(fakeView({ ...baseGrid, type: 'square' }));
    expect(screen.queryByText('Number opacity')).toBeNull();
  });

  it('shows the number-opacity row once a format is chosen', () => {
    renderPanel(fakeView({ ...baseGrid, type: 'square', cellNumbers: 'column-row' }));
    expect(screen.getByText('Number opacity')).toBeTruthy();
  });
});

// #84: a map outside every collection measures as its grid says; measured in units here.
describe('GridSettingsPanel distance per cell', () => {
  const metricGrid: GridState = { ...baseGrid, measurementType: 'units', unitType: 'feet', unitDistance: 5 };
  const field = (): HTMLInputElement => screen.getByRole('textbox', { name: 'Distance per cell in ft' });

  it('overrides the distance on leaving the field and follows the default again when emptied', () => {
    const view = fakeView(metricGrid);
    renderPanel(view);
    expect(field().placeholder).toBe('5');

    fireEvent.change(field(), { target: { value: '7,5' } });
    fireEvent.blur(field());
    expect(view.atlasStore.getState().grid?.unitDistanceOverride).toBe(7.5);

    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(view.atlasStore.getState().grid).not.toHaveProperty('unitDistanceOverride');
  });

  it('puts the stored distance back for text that is no positive number', () => {
    const view = fakeView({ ...metricGrid, unitDistanceOverride: 50 });
    renderPanel(view);
    for (const typed of ['-3', '0', '10 ft', '1 mile', 'abc']) {
      fireEvent.focus(field());
      fireEvent.change(field(), { target: { value: typed } });
      fireEvent.blur(field());
      expect(view.atlasStore.getState().grid?.unitDistanceOverride).toBe(50);
      expect(field().value).toBe('50');
    }
  });

  it('follows the stored distance when it changes elsewhere (undo, another view) while the field is not edited', () => {
    const view = fakeView({ ...metricGrid, unitDistanceOverride: 50 });
    renderPanel(view);
    expect(field().value).toBe('50');
    act(() => view.atlasStore.getState().setGrid(metricGrid));
    expect(field().value).toBe('');
    act(() => view.atlasStore.getState().setGrid({ ...metricGrid, unitDistanceOverride: 20 }));
    expect(field().value).toBe('20');
  });

  it("names the grid's distance, not a collection's, on a map outside every collection", () => {
    renderPanel(fakeView(metricGrid));
    expect(screen.getByText("Empty uses the grid's 5 ft")).toBeTruthy();
  });

  it('is not offered where distances are range bands', () => {
    renderPanel(fakeView(baseGrid));
    expect(screen.queryByRole('textbox', { name: /Distance per cell/ })).toBeNull();
  });
});
