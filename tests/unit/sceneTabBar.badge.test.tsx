import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { addPresentationTarget, invalidatePresentationTargets, tabBadgeFor, type PresentationTargetEntry } from '../../src/app/services/presentationTargets';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

class StubResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

let removers: Array<() => void> = [];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
});
afterEach(() => {
  cleanup();
  for (const remove of removers.splice(0)) remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function target(entry: Partial<PresentationTargetEntry>): PresentationTargetEntry {
  const full = { id: 't', label: 'the second screen', isActive: () => true, ...entry };
  removers.push(addPresentationTarget(full));
  return full;
}

function renderBar(): { tavern: string; cellar: string; onPresentTab: ReturnType<typeof vi.fn> } {
  const tabMetaStore = createTabMetaStore();
  const tavern = tabMetaStore.getState().addTab('Tavern.atlasmap', 'Tavern');
  const cellar = tabMetaStore.getState().addTab('Cellar.atlasmap', 'Cellar');
  tabMetaStore.getState().setActiveTab(tavern);
  const onPresentTab = vi.fn();
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={onPresentTab} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  return { tavern, cellar, onPresentTab };
}

const badges = (): string[] => [...document.querySelectorAll('.atlas-scene-tab__badge')].map((badge) => badge.textContent ?? '');

describe('a presentation target\'s tab badge', () => {
  it('shows the badge after the eye and draws the eye as shown on a tab that is not presented', () => {
    let cellarId = '';
    target({ tabBadge: ({ tabId }) => (tabId === cellarId ? '2 players' : null) });
    const { cellar, onPresentTab } = renderBar();
    cellarId = cellar;
    act(() => invalidatePresentationTargets());
    expect(badges()).toEqual(['2 players']);
    const eye = screen.getByRole('button', { name: 'Present Cellar to the second screen, 2 players' });
    const badge = eye.closest('[role="tab"]')!.querySelector('.atlas-scene-tab__badge')!;
    expect(eye.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(badge.compareDocumentPosition(screen.getByText('Cellar')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(eye.classList.contains('atlas-scene-tab__action--shown')).toBe(true);
    // Only the style and the name change: not pressed, and a click still presents the tab.
    expect(eye.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(eye);
    expect(onPresentTab).toHaveBeenCalledWith(cellar);
  });

  it('re-reads badges after invalidate', () => {
    let count = 1;
    target({ tabBadge: () => `${count} players` });
    renderBar();
    expect(badges()).toEqual(['1 players', '1 players']);
    count = 3;
    act(() => invalidatePresentationTargets());
    expect(badges()).toEqual(['3 players', '3 players']);
  });

  it('an inactive target\'s badge is ignored, and the first active non-null badge wins', () => {
    target({ id: 'off', isActive: () => false, tabBadge: () => 'off' });
    target({ id: 'none', tabBadge: () => null });
    target({ id: 'on', tabBadge: () => 'on' });
    target({ id: 'late', tabBadge: () => 'late' });
    expect(tabBadgeFor('map', 'any')).toBe('on');
  });

  it('a throwing or non-string badge shows nothing and logs once (C-badge-1)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    target({ id: 'throws', tabBadge: () => { throw new Error('boom'); } });
    target({ id: 'number', tabBadge: (() => 2) as unknown as PresentationTargetEntry['tabBadge'] });
    renderBar();
    act(() => invalidatePresentationTargets());
    expect(badges()).toEqual([]);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls.map(([message]) => String(message))).toEqual([
      expect.stringContaining('tabBadge'), expect.stringContaining('tabBadge'),
    ]);
  });

  it('trims a badge and cuts one past 24 characters with an ellipsis (C-badge-1)', () => {
    target({ tabBadge: () => `  ${'x'.repeat(30)}  ` });
    expect(tabBadgeFor('map', 'tab')).toBe(`${'x'.repeat(23)}…`);
    removers.splice(0).forEach((remove) => remove());
    target({ tabBadge: () => '   ' });
    expect(tabBadgeFor('map', 'tab')).toBeNull();
  });

  it('shows no badge without a target that gives one', () => {
    renderBar();
    expect(badges()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Show Cellar on the player view' })).toBeTruthy();
  });
});
