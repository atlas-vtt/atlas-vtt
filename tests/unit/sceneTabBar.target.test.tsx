import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { addPresentationTarget, invalidatePresentationTargets } from '../../src/app/services/presentationTargets';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

class StubResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBar(onPresentTabMenu: (tabId: string, position: { x: number; y: number }) => boolean): { tavern: string; onPresentTab: ReturnType<typeof vi.fn> } {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  tabMetaStore.getState().setActiveTab(tavern);
  const onPresentTab = vi.fn();
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={onPresentTab} onPresentTabMenu={onPresentTabMenu} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  return { tavern, onPresentTab };
}

it('names the scene in "Present {scene} to the second screen" while a target is active, with its own context menu', () => {
  const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
  const onPresentTabMenu = vi.fn(() => true);
  const { tavern, onPresentTab } = renderBar(onPresentTabMenu);
  const eye = screen.getByRole('button', { name: 'Present Tavern to the second screen' });
  fireEvent.click(eye);
  expect(onPresentTab).toHaveBeenCalledWith(tavern);
  expect(fireEvent.contextMenu(eye, { clientX: 10, clientY: 20 })).toBe(false);
  expect(onPresentTabMenu).toHaveBeenCalledWith(tavern, { x: 10, y: 20 });
  stop();
});

it('keeps the player view label and leaves right-click alone without a target', () => {
  const onPresentTabMenu = vi.fn(() => false);
  renderBar(onPresentTabMenu);
  const eye = screen.getByRole('button', { name: 'Show Tavern on the player view' });
  expect(fireEvent.contextMenu(eye, { clientX: 10, clientY: 20 })).toBe(true);
});

it('follows a target that turns inactive once the targets are invalidated', () => {
  let active = true;
  const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => active });
  renderBar(vi.fn(() => true));
  expect(screen.getByRole('button', { name: 'Present Tavern to the second screen' })).toBeTruthy();
  active = false;
  act(() => { invalidatePresentationTargets(); });
  expect(screen.getByRole('button', { name: 'Show Tavern on the player view' })).toBeTruthy();
  stop();
});
