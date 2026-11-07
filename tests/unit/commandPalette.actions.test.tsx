// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { create } from 'zustand';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';

const { openSceneBrowser, openPlayerWindow } = vi.hoisted(() => ({ openSceneBrowser: vi.fn(), openPlayerWindow: vi.fn() }));

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(),
  useAtlasUI: () => ({ view: { openSceneBrowser }, app: {} }),
}));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn(), openPlayerWindow }));
vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isShortcutScopeActive: () => true }));
vi.mock('../../src/app/react/components/command-palette/GridSettingsPanel', () => ({ GridSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/TokenSettingsPanel', () => ({ TokenSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/WidgetSettingsPanel', () => ({ WidgetSettingsPanel: () => null }));
vi.mock('../../src/app/react/components/command-palette/LocalPlayerViewSettingsPanel', () => ({ LocalPlayerViewSettingsPanel: () => null }));

import { CommandPalette } from '../../src/app/react/components/CommandPalette';

describe('Atlas search actions', () => {
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
    else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });

  it('does not focus the search field again after closing', () => {
    vi.useFakeTimers();
    const store = create(() => ({}));
    const onClose = vi.fn();
    const palette = (open: boolean): React.ReactElement => <ViewStoreProvider store={store}><CommandPalette isOpen={open} onClose={onClose} /></ViewStoreProvider>;
    const view = render(palette(true));
    const input = screen.getByPlaceholderText('Search commands...');
    const focus = vi.spyOn(input, 'focus');
    view.rerender(palette(false));
    act(() => vi.advanceTimersByTime(100));
    expect(focus).not.toHaveBeenCalled();
  });

  it('cancels its delayed work when unmounted', () => {
    vi.useFakeTimers();
    const store = create(() => ({}));
    const view = render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={vi.fn()} /></ViewStoreProvider>);
    view.unmount();
    // Match jsdom teardown: callbacks must not reach the removed document.
    vi.stubGlobal('document', undefined);
    try {
      expect(() => act(() => vi.advanceTimersByTime(100))).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('outside presses', () => {
    function renderWithToolbar(onClose: () => void): void {
      const toolbar = document.createElement('div');
      document.body.appendChild(toolbar);
      onTestFinished(() => toolbar.remove());
      const toolbarRef = { current: toolbar };
      render(<ViewStoreProvider store={create(() => ({}))}><CommandPalette isOpen onClose={onClose} toolbarRef={toolbarRef} /></ViewStoreProvider>);
    }

    beforeEach(() => vi.useFakeTimers());

    it('stays open when a quick click on an entry replaces the list before the close check runs', () => {
      const onClose = vi.fn();
      renderWithToolbar(onClose);
      const entry = screen.getByRole('button', { name: 'Widget settings' });
      fireEvent.mouseDown(entry);
      fireEvent.mouseUp(entry);
      fireEvent.click(entry);
      act(() => vi.advanceTimersByTime(20));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on a press outside the palette and the toolbar', () => {
      const onClose = vi.fn();
      renderWithToolbar(onClose);
      fireEvent.mouseDown(document.body);
      act(() => vi.advanceTimersByTime(20));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close after unmounting when the press came just before', () => {
      const onClose = vi.fn();
      renderWithToolbar(onClose);
      fireEvent.mouseDown(document.body);
      cleanup();
      act(() => vi.advanceTimersByTime(20));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it.each([
    { shiftKey: false, labels: ['Tools', 'Mode', 'Settings', 'All'] },
    { shiftKey: true, labels: ['Settings', 'Mode', 'Tools', 'All'] },
  ])('cycles palette tabs with wraparound (shift: $shiftKey)', ({ shiftKey, labels }) => {
    const store = create(() => ({}));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={vi.fn()} /></ViewStoreProvider>);
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'no matching command' } });

    for (const label of labels) {
      expect(fireEvent.keyDown(input, { key: 'Tab', shiftKey })).toBe(false);
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) }).classList.contains('atlas-active')).toBe(true);
      expect(document.activeElement).toBe(input);
      expect((input as HTMLInputElement).value).toBe('no matching command');
    }
  });

  it('shows tab labels without dedicated shortcuts and ignores Cmd+number', () => {
    const store = create(() => ({}));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={vi.fn()} /></ViewStoreProvider>);

    for (const label of ['All', 'Tools', 'Mode', 'Settings']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) }).textContent).toBe(label);
    }
    for (const key of ['1', '2', '3', '4']) {
      expect(fireEvent.keyDown(document, { key, metaKey: true })).toBe(true);
      expect(screen.getByRole('button', { name: 'All' }).classList.contains('atlas-active')).toBe(true);
    }
  });

  it('uses arrow keys and Enter to select commands after switching tabs', () => {
    const onClose = vi.fn();
    const store = create(() => ({}));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.getByRole('button', { name: /^Enter Player Mode/ }).classList.contains('atlas-focused')).toBe(true);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('button', { name: /^Freeze Player Camera/ }).classList.contains('atlas-focused')).toBe(true);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens the player window from the palette and closes the palette', () => {
    const onClose = vi.fn();
    const store = create(() => ({}));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);

    fireEvent.change(screen.getByPlaceholderText('Search commands...'), { target: { value: 'player window' } });
    fireEvent.click(screen.getByRole('button', { name: /^Open Player Window/ }));

    expect(openPlayerWindow).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it.each(['Grid settings', 'Token settings', 'Widget settings', 'Local player view settings'])('preserves native Tab navigation inside %s', (label) => {
    const store = create(() => ({}));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={vi.fn()} /></ViewStoreProvider>);
    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
    expect(fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })).toBe(true);
  });

  it.each(['scene', 'asset manager', 'toggle'])('finds and opens the scene browser for "%s"', (query) => {
    const setActiveTool = vi.fn();
    const onClose = vi.fn();
    const store = create(() => ({ setActiveTool }));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);

    fireEvent.change(screen.getByPlaceholderText('Search commands...'), { target: { value: query } });
    fireEvent.click(screen.getByRole('button', { name: 'Open scene browser' }));

    expect(openSceneBrowser).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalled();
    expect(setActiveTool).not.toHaveBeenCalled();
  });

  it.each([
    { initiallyOpen: false, activation: 'click' },
    { initiallyOpen: true, activation: 'click' },
    { initiallyOpen: false, activation: 'keyboard' },
    { initiallyOpen: true, activation: 'keyboard' },
  ])('opens the dice log and closes search ($activation, initially open: $initiallyOpen)', ({ initiallyOpen, activation }) => {
    const setDiceLogOpen = vi.fn();
    const onClose = vi.fn();
    const store = create(() => ({ isDiceLogOpen: initiallyOpen, setDiceLogOpen }));
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);

    fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
    const input = screen.getByPlaceholderText('Search commands...');
    fireEvent.change(input, { target: { value: 'dice log' } });
    const action = screen.getByRole('button', { name: /Open dice log/ });
    expect(action.querySelector('.atlas-command-item-toggle')).toBeNull();

    if (activation === 'click') fireEvent.click(action);
    else fireEvent.keyDown(input, { key: 'Enter' });

    expect(setDiceLogOpen).toHaveBeenCalledExactlyOnceWith(true);
    expect(onClose).toHaveBeenCalled();
  });
});
