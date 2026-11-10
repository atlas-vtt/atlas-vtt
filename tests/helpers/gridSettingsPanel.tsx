import React from 'react';
import type { App } from 'obsidian';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { create } from 'zustand';
import type { AtlasView } from '../../src/app/atlas-view';
import { GridSettingsPanel } from '../../src/app/react/components/command-palette/GridSettingsPanel';
import type { GridState } from '../../src/app/types/gridTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/** A view whose store holds `grid` for the map at `mapPath`, in `app`. */
export function fakeGridView(grid: GridState | null, { mapPath = null, app = createInMemoryApp().app }: { mapPath?: string | null; app?: App } = {}): AtlasView {
  const store = create<{ grid: GridState | null; mapPath: string | null; setGrid: (grid: GridState) => void }>((set) => ({
    grid,
    mapPath,
    setGrid: (next) => set({ grid: next }),
  }));
  return { atlasStore: store, app } as unknown as AtlasView;
}

/** The palette's grid page for `view`. */
export function renderGridPanel(view: AtlasView): void {
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
