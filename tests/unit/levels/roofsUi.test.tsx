// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SceneLevelsPanel } from '../../../src/app/react/components/command-palette/SceneLevelsPanel';
import { LevelSwitcher } from '../../../src/app/react/components/levels/LevelSwitcher';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

afterEach(cleanup);

const level = (id: string, i: number, foreground?: string): SceneLevel => ({ id, name: id[0]!.toUpperCase() + id.slice(1), elevation: { bottom: i * 10, top: i * 10 + 10 }, background: null, ...(foreground && { foreground }) });

function mount(levels: SceneLevel[] | undefined, element: React.ReactElement): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `roofs-ui-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ levels, viewedLevel: levels?.at(-1)?.id ?? null });
  getHistoryStore(store)?.getState().clear();
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  render(<AtlasUIContext.Provider value={ui}><ViewStoreProvider store={store}>{element}</ViewStoreProvider></AtlasUIContext.Provider>);
  return store;
}

describe('a level\'s roof in Scene levels', () => {
  it('opens under the level\'s row, names its image, and removes it as a scene setting, no undo step', () => {
    const store = mount([level('ground', 0), level('upper', 1, 'maps/roofs/upper roof.png')], <SceneLevelsPanel />);
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Roof of Upper' })));
    expect(screen.getByText('upper roof.png')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace…' })).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Remove the roof of Upper' })));
    expect(store.getState().levels![1]).not.toHaveProperty('foreground');
    expect(screen.getByText('No roof')).toBeTruthy();
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('is offered for a scene of one level, which has no rows', () => {
    mount(undefined, <SceneLevelsPanel />);
    expect(screen.getByText('No roof')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose…' })).toBeTruthy();
  });
});

describe('the GM\'s Roofs on the level switcher', () => {
  it('hides the roofs of the GM\'s picture and shows them again, never saved', () => {
    const store = mount([level('ground', 0), level('upper', 1, 'maps/roof.png')], <LevelSwitcher />);
    const roofs = screen.getByRole('button', { name: /roofs/i });
    expect(roofs.getAttribute('aria-pressed')).toBe('true');
    act(() => fireEvent.click(roofs));
    expect(store.getState().roofsHidden).toBe(true);
    expect(screen.getByRole('button', { name: /roofs/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('stands alone in a scene of one level with a roof, and is gone where the level shown has none', () => {
    mount([level('ground', 0, 'maps/roof.png')], <LevelSwitcher />);
    expect(screen.getByRole('button', { name: /roofs/i })).toBeTruthy();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    cleanup();
    mount([level('ground', 0, 'maps/roof.png'), level('upper', 1)], <LevelSwitcher />);
    expect(screen.queryByRole('button', { name: /roofs/i })).toBeNull();
  });
});
