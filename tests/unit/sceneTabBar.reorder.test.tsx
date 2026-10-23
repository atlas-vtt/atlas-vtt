// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe(): void {} disconnect(): void {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup() {
  const store = createTabMetaStore();
  const ids = ['Tavern', 'Abbey Hill', 'Undercroft'].map((name) => store.getState().addTab(`${name}.atlasmap`, name));
  store.getState().setActiveTab(ids[0]!);
  const switchTab = vi.fn();
  const present = vi.fn();
  const close = vi.fn();
  const move = vi.fn((source: string, before: string | null) => store.getState().moveTab(source, before));
  const value = { app: {}, view: { viewId: 'reorder', tabMetaStore: store }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}><SceneTabBar onSwitchTab={switchTab} onPresentTab={present}
    onCloseTab={close} onAddTab={vi.fn()} onShowAllTabs={vi.fn()} onMoveTab={move} presentedTabId={ids[0]!} /></AtlasUIContext.Provider>);
  return { store, ids, switchTab, present, close, move };
}

describe('keyboard scene tab ordering', () => {
  it('moves and reveals an inactive focused tab in either direction, keeping the active and presented scene', () => {
    const { store, ids, switchTab, present, close } = setup();
    const held = screen.getByRole('tab', { name: /Abbey Hill/ });
    held.focus();
    fireEvent.keyDown(held, { key: 'ArrowLeft', altKey: true });
    expect(store.getState().tabs.map((tab) => tab.id)).toEqual([ids[1], ids[0], ids[2]]);
    expect(document.activeElement).toBe(held);
    expect(screen.getByRole('status').textContent).toBe('Abbey Hill moved to position 1 of 3.');
    expect(vi.mocked(held.scrollIntoView)).toHaveBeenCalledWith(expect.objectContaining({ inline: 'nearest' }));
    fireEvent.keyDown(held, { key: 'ArrowRight', altKey: true });
    expect(store.getState().tabs.map((tab) => tab.id)).toEqual(ids);
    expect(store.getState().activeTabId).toBe(ids[0]);
    expect(screen.getByRole('button', { name: 'Tavern is shown on the player view' }).getAttribute('aria-pressed')).toBe('true');
    expect(switchTab).not.toHaveBeenCalled();
    expect(present).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('does not move past boundaries or steal modified shortcuts and action-button keys', () => {
    const { ids, store, move } = setup();
    const first = screen.getByRole('tab', { name: /Tavern/ });
    const last = screen.getByRole('tab', { name: /Undercroft/ });
    fireEvent.keyDown(first, { key: 'ArrowLeft', altKey: true });
    fireEvent.keyDown(last, { key: 'ArrowRight', altKey: true });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    fireEvent.keyDown(first, { key: 'ArrowRight', altKey: true, ctrlKey: true });
    fireEvent.keyDown(first, { key: 'ArrowRight', altKey: true, metaKey: true });
    fireEvent.keyDown(first, { key: 'ArrowRight', altKey: true, shiftKey: true });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close Tavern' }), { key: 'ArrowRight', altKey: true });
    expect(store.getState().tabs.map((tab) => tab.id)).toEqual(ids);
    expect(move).not.toHaveBeenCalled();
  });

  it('keeps normal click, Enter, Space, eye and close interactions', () => {
    const { switchTab, present, close, ids } = setup();
    const tab = screen.getByRole('tab', { name: /Abbey Hill/ });
    fireEvent.click(tab);
    fireEvent.keyDown(tab, { key: 'Enter' });
    fireEvent.keyDown(tab, { key: ' ' });
    expect(switchTab.mock.calls).toEqual([[ids[1]], [ids[1]], [ids[1]]]);
    fireEvent.click(screen.getByRole('button', { name: 'Show Abbey Hill on the player view' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Abbey Hill' }));
    expect(present).toHaveBeenCalledExactlyOnceWith(ids[1]);
    expect(close).toHaveBeenCalledExactlyOnceWith(ids[1]);
  });
});
