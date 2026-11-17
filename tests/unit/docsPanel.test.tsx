// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';

vi.mock('../../src/app/react/root/AtlasUIContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/react/root/AtlasUIContext')>(), useAtlasUI: () => ({ app: {}, view: { viewId: 'docs-test' } }) }));
vi.mock('../../src/app/services/PlayerWindowService', () => ({ PlayerWindowService: {} }));
vi.mock('../../src/app/services/PlayerWindowPresenter', () => ({ presentActiveTab: vi.fn() }));

import { CommandPalette } from '../../src/app/react/components/CommandPalette';
import { DocsWindow } from '../../src/app/react/components/documentation/DocsPanel';

function createDocsStore(open = false) {
  return create<{ isDocsOpen: boolean; setDocsOpen: (open: boolean) => void }>((set) => ({
    isDocsOpen: open,
    setDocsOpen: (isDocsOpen) => set({ isDocsOpen }),
  }));
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  setOnline(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  Reflect.deleteProperty(window.navigator, 'onLine');
});

describe('the documentation panel', () => {
  it('opens from the command palette, which then closes', () => {
    const store = createDocsStore();
    const onClose = vi.fn();
    render(<ViewStoreProvider store={store}><CommandPalette isOpen onClose={onClose} /></ViewStoreProvider>);
    fireEvent.change(screen.getByPlaceholderText('Search commands…'), { target: { value: 'help' } });

    fireEvent.click(screen.getByRole('button', { name: /Documentation/ }));

    expect(store.getState().isDocsOpen).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the live docs in a sandboxed frame, with a skeleton until the page has loaded', () => {
    render(<ViewStoreProvider store={createDocsStore(true)}><DocsWindow /></ViewStoreProvider>);

    const frame = screen.getByLabelText('Atlas documentation', { selector: 'iframe' });
    expect(frame.getAttribute('src')).toBe('https://atlas-vtt.dev/docs');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.hasAttribute('title')).toBe(false);
    expect(screen.getByText('Loading the documentation')).toBeTruthy();

    fireEvent.load(frame);
    expect(screen.queryByText('Loading the documentation')).toBeNull();
  });

  it('says it is offline instead of showing an empty frame, and loads once the connection is back', () => {
    setOnline(false);
    render(<ViewStoreProvider store={createDocsStore(true)}><DocsWindow /></ViewStoreProvider>);

    expect(screen.getByText('You are offline')).toBeTruthy();
    expect(screen.queryByLabelText('Atlas documentation', { selector: 'iframe' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('You are offline')).toBeTruthy();

    setOnline(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(screen.queryByText('You are offline')).toBeNull();
    expect(screen.getByLabelText('Atlas documentation', { selector: 'iframe' })).toBeTruthy();
  });

  it('holds the page at its size while the window is resized, and sizes it once on release', () => {
    const { container } = render(<ViewStoreProvider store={createDocsStore(true)}><DocsWindow /></ViewStoreProvider>);
    const frame = screen.getByLabelText('Atlas documentation', { selector: 'iframe' }) as HTMLIFrameElement;
    Object.defineProperty(frame, 'offsetWidth', { configurable: true, value: 1080 });
    Object.defineProperty(frame, 'offsetHeight', { configurable: true, value: 760 });
    const corner = container.querySelector('.atlas-docs-panel__resize--corner')!;
    vi.stubGlobal('PointerEvent', MouseEvent); // jsdom has none, and a plain Event carries no button

    fireEvent.pointerDown(corner, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 60 });
    expect(frame.style.width).toBe('1080px');
    expect(frame.style.height).toBe('760px');

    fireEvent.pointerUp(window);
    expect(frame.style.width).toBe('');
    expect(frame.style.height).toBe('');
  });

  it('closes on Escape while it holds focus', () => {
    const store = createDocsStore(true);
    render(<ViewStoreProvider store={store}><DocsWindow /></ViewStoreProvider>);
    const openInBrowser = screen.getByRole('button', { name: 'Open in browser' });
    openInBrowser.focus();

    fireEvent.keyDown(openInBrowser, { key: 'Escape' });
    expect(store.getState().isDocsOpen).toBe(false);
  });

  it('closes from its close button', () => {
    const store = createDocsStore(true);
    render(<ViewStoreProvider store={store}><DocsWindow /></ViewStoreProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Close documentation' }));
    expect(store.getState().isDocsOpen).toBe(false);
  });
});
