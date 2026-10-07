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

function renderBar(): { tavern: string; onPresentTab: ReturnType<typeof vi.fn> } {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  tabMetaStore.getState().setActiveTab(tavern);
  const onPresentTab = vi.fn();
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={onPresentTab} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  return { tavern, onPresentTab };
}

it('names the scene in "Present {scene} to the second screen" while a target is active', () => {
  const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => true });
  const { tavern, onPresentTab } = renderBar();
  fireEvent.click(screen.getByRole('button', { name: 'Present Tavern to the second screen' }));
  expect(onPresentTab).toHaveBeenCalledWith(tavern);
  stop();
});

it('keeps the player view label without a target', () => {
  renderBar();
  expect(screen.getByRole('button', { name: 'Show Tavern on the player view' })).toBeTruthy();
});

it('follows a target that turns inactive once the targets are invalidated', () => {
  let active = true;
  const stop = addPresentationTarget({ id: 't', label: 'the second screen', isActive: () => active });
  renderBar();
  expect(screen.getByRole('button', { name: 'Present Tavern to the second screen' })).toBeTruthy();
  active = false;
  act(() => { invalidatePresentationTargets(); });
  expect(screen.getByRole('button', { name: 'Show Tavern on the player view' })).toBeTruthy();
  stop();
});
