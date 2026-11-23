// @vitest-environment jsdom
import React, { useRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChromeAutoHide } from '../../src/app/react/components/chrome-auto-hide/useChromeAutoHide';
import { PEEK_MS } from '../../src/app/react/components/chrome-auto-hide/useToolbarPeek';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { SettingsService } from '../../src/app/services/SettingsService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function Root({ settings }: { settings: SettingsService }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useChromeAutoHide(ref, false, settings);
  return <div ref={ref} className="atlas-ui"><div className="atlas-main-toolbar" /></div>;
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useChromeAutoHide', () => {
  // UIRoot calls it outside the view's context, which it provides itself: the switch must reach it all the same.
  it('follows the setting without the view context around it', () => {
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    const store = createViewAtlasStore(app, `chrome-auto-hide-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    const { container } = render(<ViewStoreProvider store={store}><Root settings={settings} /></ViewStoreProvider>);
    const root = container.querySelector('.atlas-ui')!;
    expect(root.hasAttribute('data-chrome-auto-hide')).toBe(false);

    act(() => { settings.setToolbarAutoHide(true); });
    expect(root.hasAttribute('data-chrome-auto-hide')).toBe(true);

    act(() => { store.getState().setToolbarEditing(true); });
    expect(root.hasAttribute('data-chrome-auto-hide')).toBe(false);
  });

  it('shows the toolbar for a moment when the tool or its mode changes', () => {
    vi.useFakeTimers();
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    const store = createViewAtlasStore(app, `chrome-auto-hide-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    settings.setToolbarAutoHide(true);
    const { container } = render(<ViewStoreProvider store={store}><Root settings={settings} /></ViewStoreProvider>);
    const toolbar = container.querySelector('.atlas-main-toolbar')!;
    expect(toolbar.hasAttribute('data-peek')).toBe(false);

    act(() => { store.getState().setActiveTool('measure'); });
    expect(toolbar.hasAttribute('data-peek')).toBe(true);
    act(() => { vi.advanceTimersByTime(PEEK_MS - 100); });
    // Cycling on starts the moment again.
    act(() => { store.getState().setMeasureTool({ mode: store.getState().measureTool.mode === 'ruler' ? 'circle' : 'ruler' }); });
    act(() => { vi.advanceTimersByTime(PEEK_MS - 100); });
    expect(toolbar.hasAttribute('data-peek')).toBe(true);
    act(() => { vi.advanceTimersByTime(200); });
    expect(toolbar.hasAttribute('data-peek')).toBe(false);
  });

  it('leaves the toolbar hidden under the palette when a tool is picked there', () => {
    const { app } = createInMemoryApp({ files: {} });
    const settings = new SettingsService(app);
    const store = createViewAtlasStore(app, `chrome-auto-hide-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    settings.setToolbarAutoHide(true);
    const { container } = render(<ViewStoreProvider store={store}><Root settings={settings} /></ViewStoreProvider>);
    const toolbar = container.querySelector('.atlas-main-toolbar')!;

    act(() => { store.getState().setCommandPaletteOpen(true); });
    act(() => { store.getState().setActiveTool('fog'); });
    expect(toolbar.hasAttribute('data-peek')).toBe(false);
  });
});
