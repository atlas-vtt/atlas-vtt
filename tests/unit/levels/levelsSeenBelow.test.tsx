// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readSceneLevels } from '../../../src/app/levels/levelFile';
import { withLevelSight } from '../../../src/app/levels/levelEdits';
import { levelsShownBelow } from '../../../src/app/levels/levelStack';
import { SceneLevelsPanel } from '../../../src/app/react/components/command-palette/SceneLevelsPanel';
import { setLevelOpenArt, setLevelSees } from '../../../src/app/react/components/levels/levelEditing';
import { AtlasUIContext, type AtlasUIContextValue } from '../../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

afterEach(cleanup);

const LEVELS: SceneLevel[] = ['cellar', 'ground', 'upper'].map((id, i) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), elevation: { bottom: i * 10, top: i * 10 + 10 }, background: null }));

function storeOf(levels: SceneLevel[] = LEVELS): { store: ViewAtlasStore; app: AtlasUIContextValue['app'] } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `levels-seen-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ levels, viewedLevel: 'upper' });
  getHistoryStore(store)?.getState().clear();
  return { store, app };
}

const upper = (store: ViewAtlasStore): SceneLevel => store.getState().levels!.find((level) => level.id === 'upper')!;

describe('what a level shows of the levels below', () => {
  it('reads openArt from a file only where it is false, and keeps the levels a level sees', () => {
    const levels = readSceneLevels([
      { id: 'a', name: 'A', elevation: { bottom: 0, top: 1 }, openArt: false },
      { id: 'b', name: 'B', elevation: { bottom: 1, top: 2 }, openArt: 'no', sees: ['a', 3] },
    ], null)!;
    expect(levels[0]!.openArt).toBe(false);
    expect('openArt' in levels[1]!).toBe(false);
    expect(levels[1]!.sees).toEqual(['a']);
  });

  it('writes unset as no field at all, so a level put back is the level as it came', () => {
    const changed = withLevelSight(LEVELS, 'upper', { sees: ['cellar'], openArt: false });
    expect(changed[2]).toMatchObject({ sees: ['cellar'], openArt: false });
    const back = withLevelSight(changed, 'upper', { sees: undefined, openArt: true });
    expect(back[2]).toEqual(LEVELS[2]);
    expect(withLevelSight(changed, 'upper', { openArt: true })[2]).toEqual({ ...LEVELS[2], sees: ['cellar'] });
  });

  it('stores the levels seen as a list only while one below is left out, and no undo step', () => {
    const { store } = storeOf();
    setLevelSees(store, 'upper', 'ground', false);
    expect(upper(store).sees).toEqual(['cellar']);
    expect(levelsShownBelow(store.getState().levels!, 'upper')).toEqual(['cellar']);
    setLevelSees(store, 'upper', 'ground', true);
    expect('sees' in upper(store)).toBe(false);
    setLevelOpenArt(store, 'upper', false);
    expect(upper(store).openArt).toBe(false);
    setLevelOpenArt(store, 'upper', true);
    expect('openArt' in upper(store)).toBe(false);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('offers the switches under a level\'s row, and none for the bottom level', () => {
    const { store, app } = storeOf();
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <ViewStoreProvider store={store}><SceneLevelsPanel /></ViewStoreProvider>
      </AtlasUIContext.Provider>,
    );
    const nothing = screen.getByRole('button', { name: /No level lies below Cellar/ });
    expect((nothing as HTMLButtonElement).disabled).toBe(true);
    act(() => fireEvent.click(screen.getByRole('button', { name: /What Upper shows of the levels below/ })));
    const transparent = screen.getByRole('switch', { name: 'Transparent parts are open' });
    expect(transparent.getAttribute('aria-checked')).toBe('true');
    act(() => fireEvent.click(transparent));
    expect(upper(store).openArt).toBe(false);
    act(() => fireEvent.click(screen.getByRole('switch', { name: 'Ground' })));
    expect(upper(store).sees).toEqual(['cellar']);
    expect(screen.getByRole('switch', { name: 'Ground' }).getAttribute('aria-checked')).toBe('false');
  });
});
