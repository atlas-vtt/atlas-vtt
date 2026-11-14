// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const map = vi.hoisted(() => ({ collection: null as string | null }));

// Which collection a map belongs to is the asset index's to say; the dialog is its own tests'.
vi.mock('../../src/app/react/hooks/useMapCollectionId', () => ({ useMapCollectionId: () => map.collection }));
vi.mock('../../src/app/react/components/CollectionSettingsModal', () => ({
  CollectionSettingsModal: ({ collectionId, initialTab, onClose }: { collectionId: string; initialTab: string; onClose: () => void }) => (
    <div role="dialog" data-collection={collectionId} data-tab={initialTab}><button onClick={onClose}>Close rules</button></div>
  ),
}));

import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { MeasureToolGroup } from '../../src/app/packages/components/toolbar/MeasureToolGroup';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

afterEach(() => {
  cleanup();
  map.collection = null;
});

interface Mounted {
  settings: SettingsService;
  closeMenu: ReturnType<typeof vi.fn>;
  selectTool: ReturnType<typeof vi.fn>;
}

function mount(options: { playerView?: boolean; mode?: 'ruler' | 'cone' } = {}): Mounted {
  const { app } = createInMemoryApp({ files: {} });
  const settings = new SettingsService(app);
  const store = createViewAtlasStore(app, `measure-group-${Math.random()}`, undefined, options.playerView ?? false);
  store.getState().setPersistenceEnabled(false);
  if (options.mode) store.getState().setMeasureTool({ mode: options.mode });
  const closeMenu = vi.fn();
  const selectTool = vi.fn();
  const ui = { app, view: null, pixiApp: null, renderer: null } as unknown as AtlasUIContextValue;
  render(
    <AtlasUIContext.Provider value={ui}>
      <ViewStoreProvider store={store}>
        <TooltipProvider>
          <MeasureToolGroup activeTool="measure" selectTool={selectTool} menuOpen toggleMenu={() => undefined} closeMenu={closeMenu} />
        </TooltipProvider>
      </ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { settings, closeMenu, selectTool };
}

const option = (name: string): HTMLElement => screen.getByRole('radio', { name });
const chosen = (name: string): boolean => option(name).getAttribute('aria-checked') === 'true';
const rules = (): HTMLElement | null => screen.queryByRole('button', { name: 'Measurement rules…' });

describe('the measure tool\'s menu', () => {
  it('shows the tool by its mode and selects the one measure tool', () => {
    const { selectTool } = mount({ mode: 'cone' });
    fireEvent.click(screen.getByRole('button', { name: 'Cone' }));
    expect(selectTool).toHaveBeenCalledWith('measure');
  });

  it('holds when a dragged token shows its distance, as Atlas\' own setting, and no shapes or switches', () => {
    const { settings } = mount();
    expect(screen.getByRole('radiogroup', { name: 'Distance while moving tokens' })).toBeTruthy();
    expect(chosen('Always')).toBe(true);
    fireEvent.click(option('In combat'));
    expect(settings.getDragDistance()).toBe('combat');
    expect(chosen('In combat')).toBe(true);
    fireEvent.click(option('Never'));
    expect(settings.getDragDistance()).toBe('never');
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Circle' })).toBeNull();
  });

  it('opens the rules of the map\'s collection on its grid and measurement tab, and closes the menu', () => {
    map.collection = 'Barrowmaze';
    const { closeMenu } = mount();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(rules()!);
    expect(closeMenu).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('dialog');
    expect(dialog.dataset).toMatchObject({ collection: 'Barrowmaze', tab: 'grid' });
    fireEvent.click(screen.getByRole('button', { name: 'Close rules' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the rules row disabled for a map outside every collection, and not at all to players', () => {
    mount();
    expect(rules()!.hasAttribute('disabled')).toBe(true);
    cleanup();
    map.collection = 'Barrowmaze';
    mount({ playerView: true });
    expect(rules()).toBeNull();
    expect(chosen('Always')).toBe(true);
  });
});
