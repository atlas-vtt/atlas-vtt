// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MAX_AREA_NAME } from '../../src/app/fog/fogAreas';
import { FogAreaPopoverHost } from '../../src/app/react/components/fog/FogAreaPopover';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';

beforeAll(() => { MotionGlobalConfig.skipAnimations = true; });
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

function renderPopover(name?: string): { store: ViewAtlasStore; hall: string; named: () => string | undefined; steps: () => number; field: () => HTMLInputElement } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-area-popover-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/areas.atlasmap');
  const hall = store.getState().addFogArea({ type: 'rectangle', x: 0, y: 0, width: 200, height: 100 }, name)!;
  const history = getHistoryStore(store)!;
  history.getState().clear();
  const ui: AtlasUIContextValue = { app, view: null, pixiApp: null, renderer: null };
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}><FogAreaPopoverHost /></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  act(() => store.getState().openFogAreaPopover(hall));
  return {
    store, hall,
    named: () => {
      const area = store.getState().objects.fog[hall];
      return area && 'area' in area ? area.area?.name : undefined;
    },
    steps: () => history.getState().pastStates.length,
    field: () => screen.getByLabelText('Name'),
  };
}

const closed = (): Promise<void> => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

describe('FogAreaPopover', () => {
  it('is closed until an area is renamed, and opens with the area\'s name ready to type over', () => {
    const { field } = renderPopover('Hall');
    const popover = screen.getByRole('dialog', { name: 'Rename area' });
    expect(field().value).toBe('Hall');
    expect(field().ownerDocument.activeElement).toBe(field());
    expect([field().selectionStart, field().selectionEnd]).toEqual([0, 4]);
    expect(field().maxLength).toBe(MAX_AREA_NAME);
    expect(popover.querySelector('[title]')).toBeNull();
  });

  it('names the area on Enter, in one undo step, and closes', async () => {
    const { store, named, steps, field } = renderPopover();
    fireEvent.change(field(), { target: { value: '  Crypt ' } });
    expect(named()).toBeUndefined();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(named()).toBe('Crypt');
    expect(steps()).toBe(1);
    expect(store.getState().fogAreaPopover).toBeNull();
    await closed();
    // Leaving the field as it closes names nothing a second time.
    expect(steps()).toBe(1);
  });

  it('names the area when the field is left', async () => {
    const { store, named, steps, field } = renderPopover('Hall');
    fireEvent.change(field(), { target: { value: 'Great hall' } });
    fireEvent.blur(field());
    expect(named()).toBe('Great hall');
    expect(steps()).toBe(1);
    expect(store.getState().fogAreaPopover).toBeNull();
    await closed();
  });

  it('takes the name away when the field is emptied', () => {
    const { named, steps, field } = renderPopover('Hall');
    fireEvent.change(field(), { target: { value: '   ' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(named()).toBeUndefined();
    expect(steps()).toBe(1);
  });

  it('leaves the name as it was on Escape, and no undo step, also when the field is then left', async () => {
    const { store, named, steps, field } = renderPopover('Hall');
    fireEvent.change(field(), { target: { value: 'Something else' } });
    const input = field();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(store.getState().fogAreaPopover).toBeNull();
    fireEvent.blur(input);
    expect(named()).toBe('Hall');
    expect(steps()).toBe(0);
    await closed();
  });

  it('leaves no undo step where the name did not change', () => {
    const { steps, field } = renderPopover('Hall');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(steps()).toBe(0);
  });

  it('keeps its keys from the map\'s shortcuts', () => {
    const { field } = renderPopover('Hall');
    let reached = 0;
    const count = (): void => { reached++; };
    document.addEventListener('keydown', count);
    for (const key of ['h', 'Delete', 'Backspace', ' ', 'Enter', 'Escape']) fireEvent.keyDown(field(), { key });
    document.removeEventListener('keydown', count);
    expect(reached).toBe(0);
  });

  it('gives each area a field of its own: a name typed for one never lands on another', async () => {
    const { store, hall, field } = renderPopover('Hall');
    const crypt = store.getState().addFogArea({ type: 'rectangle', x: 400, y: 0, width: 100, height: 100 }, 'Crypt')!;
    fireEvent.change(field(), { target: { value: 'Typed for the hall' } });
    act(() => store.getState().openFogAreaPopover(crypt));
    await waitFor(() => expect(screen.getAllByLabelText('Name')).toHaveLength(1));
    expect(field().value).toBe('Crypt');
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(store.getState().objects.fog[crypt]).toMatchObject({ area: { name: 'Crypt' } });
    expect(store.getState().objects.fog[hall]).toMatchObject({ area: { name: expect.stringMatching(/hall/i) } });
  });
});
