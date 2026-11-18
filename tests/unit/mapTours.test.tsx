// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { SettingsService } from '../../src/app/services/SettingsService';
import { MapTours, mapSteps } from '../../src/app/onboarding/MapTours';
import { HotkeyHelp } from '../../src/app/keyboard/HotkeyHelp';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';

afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.useRealTimers(); });

const settings = (): SettingsService => new SettingsService({ vault: { adapter: { exists: async () => true, write: async () => {} } } } as never);

function loadedMap(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, 'tour-view');
  store.getState().setPersistenceEnabled(false);
  store.setState({ isMapLoading: false, mapLoaded: true });
  return store;
}

function mapView(): HTMLElement {
  const root = document.body.createDiv();
  root.createDiv({ cls: 'atlas-scene-tab-bar' });
  return root;
}

function renderTours(store: ViewAtlasStore, root: HTMLElement, service: SettingsService): void {
  render(<ViewStoreProvider store={store}><MapTours root={root} settings={service} /></ViewStoreProvider>);
}

describe('the map tour', () => {
  it('shows once a scene is loaded, steps with the arrow keys and is done for good', () => {
    const service = settings();
    renderTours(loadedMap(), mapView(), service);

    expect(screen.getByText('Your first scene')).toBeTruthy();
    const card = screen.getByRole('dialog');
    fireEvent.keyDown(card, { key: 'ArrowRight' });
    expect(screen.getByText('Scene tabs')).toBeTruthy();
    fireEvent.keyDown(card, { key: 'ArrowLeft' });
    expect(screen.getByText('Your first scene')).toBeTruthy();

    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(service.shouldShowTutorial('map')).toBe(false);
  });

  it('waits while the scene loads and while the shortcuts sheet covers the map', () => {
    const store = loadedMap();
    store.setState({ isMapLoading: true });
    renderTours(store, mapView(), settings());
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => store.setState({ isMapLoading: false, isHotkeyHelpOpen: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => store.setState({ isHotkeyHelpOpen: false }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('names the keys as the GM bound them', () => {
    const assets = mapSteps((id) => (id === 'assets' ? 'Q' : 'X'), false).find((step) => step.title === 'Asset manager');
    expect(assets?.keys).toEqual(['Q']);
    expect(mapSteps(() => 'X', true)[0]?.body).toContain('Pinch to zoom');
    expect(mapSteps(() => 'X', false)[0]?.body).toContain('right mouse button');
  });
});

describe('online play’s tours', () => {
  it('point at the dock and then the table log once each appears, after the map tour', () => {
    vi.useFakeTimers();
    const service = settings();
    service.completeTutorial('map');
    const root = mapView();
    renderTours(loadedMap(), root, service);
    expect(screen.queryByRole('dialog')).toBeNull();

    root.createDiv({ cls: 'atlas-online-dock' });
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText('Play online')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));

    root.createDiv({ cls: 'atlas-online-log-tab' });
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.getByText('Table log')).toBeTruthy();
  });
});

describe('taking the tour again', () => {
  it('starts the map tour from the shortcuts sheet and leaves the other tours finished', () => {
    const service = settings();
    service.completeTutorial('map');
    service.completeTutorial('assets');
    const onTour = vi.fn(() => service.replayTutorial('map'));
    render(<HotkeyHelp settings={service} onClose={() => {}} onTour={onTour} />);

    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(onTour).toHaveBeenCalledOnce();
    expect(service.shouldShowTutorial('map')).toBe(true);
    expect(service.shouldShowTutorial('assets')).toBe(false);
  });

  it('is offered only where the sheet is given a tour', () => {
    render(<HotkeyHelp settings={settings()} onClose={() => {}} isPlayerView />);
    expect(screen.queryByRole('button', { name: 'Take the tour' })).toBeNull();
  });
});
