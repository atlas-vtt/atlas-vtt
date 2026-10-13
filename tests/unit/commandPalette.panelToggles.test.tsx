import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(), useAtlasUI: () => ({ app: {}, view: {} }) }));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/SceneSnapshotsPanel', () => ({
  SceneSnapshotsPanel: ({ onRestore }: { onRestore: () => void }) => <button onClick={onRestore}>Restore snapshot</button>,
}));

import { CommandPalette } from '../../src/app/react/components/CommandPalette';

function createPanelStore() {
  return create<{
    initiativeTrackerOpen: boolean;
    isDiceLogOpen: boolean;
    setInitiativeTrackerOpen: (open: boolean) => void;
    setDiceLogOpen: (open: boolean) => void;
  }>((set) => ({
    initiativeTrackerOpen: false,
    isDiceLogOpen: false,
    setInitiativeTrackerOpen: (open) => set({ initiativeTrackerOpen: open }),
    setDiceLogOpen: (open) => set({ isDiceLogOpen: open }),
  }));
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView'); });

describe('Space command menu panel toggles', () => {
  it('toggles initiative visibility from widget settings and reflects external changes', () => {
    const store = createPanelStore();
    const onClose = vi.fn();
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);
    expect(screen.queryByRole('button', { name: 'Toggle initiative tracker' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Widget settings' }));
    const toggle = screen.getByRole('switch', { name: 'Show initiative tracker' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);
    expect(store.getState().initiativeTrackerOpen).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(store.getState().initiativeTrackerOpen).toBe(false);

    act(() => store.setState({ initiativeTrackerOpen: true }));
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(store.getState().initiativeTrackerOpen).toBe(false);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the dice log without closing it on repeated activation', () => {
    const store = createPanelStore();
    const onClose = vi.fn();
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'dice log' } });
    const command = screen.getByRole('button', { name: /Open dice log/ });

    expect(store.getState().isDiceLogOpen).toBe(false);
    fireEvent.click(command);
    expect(store.getState().isDiceLogOpen).toBe(true);
    fireEvent.click(command);
    expect(store.getState().isDiceLogOpen).toBe(true);

    act(() => store.setState({ isDiceLogOpen: false }));
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.getState().isDiceLogOpen).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('morphs into the scene snapshots page and closes when a snapshot is restored', () => {
    const onClose = vi.fn();
    render(<ViewStoreProvider store={createPanelStore()}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Scene snapshots/ }));
    expect(screen.getByRole('heading', { name: 'Scene Snapshots' })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search commands...')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Restore snapshot' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
