// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { watchInput } from '../../src/app/packages/components/primitives/lastInput';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import type { ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import { SceneTabBar, sceneTabMoveEntries } from '../../src/app/react/components/SceneTabBar';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

const openContextMenuGlobal = vi.hoisted(() => vi.fn<(entries: ContextMenuEntry[], at: { x: number; y: number }) => boolean>(() => true));
vi.mock('../../src/app/react/root/ContextMenuContext', async (original) => ({
  ...(await original<typeof import('../../src/app/react/root/ContextMenuContext')>()),
  openContextMenuGlobal,
}));

class StubResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

let stopWatching: () => void = () => undefined;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  openContextMenuGlobal.mockClear();
  stopWatching = watchInput(document);
});
afterEach(() => {
  use('mouse');
  stopWatching();
  cleanup();
  vi.unstubAllGlobals();
});

/** A pointer event as a device of `kind` sends it: what tells a finger's long press from a mouse's right-click. */
function use(kind: 'mouse' | 'touch'): void {
  const event = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: kind });
  document.body.dispatchEvent(event);
}

function setup(names: string[] = ['Tavern', 'Crystal Caves', 'Cave Entrance']): { order: () => string[]; tab: (name: string) => HTMLElement } {
  const tabMetaStore = createTabMetaStore();
  const ids = names.map((name) => tabMetaStore.getState().addTab(`${name}.atlasmap`, name));
  tabMetaStore.getState().setActiveTab(ids[0]!);
  const onMoveTab = (tabId: string, toIndex: number): void => { tabMetaStore.getState().moveTab(tabId, toIndex); };
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onMoveTab={onMoveTab} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={vi.fn()} onShowAllTabs={vi.fn()} />
  </AtlasUIContext.Provider>);
  return {
    order: () => tabMetaStore.getState().tabs.map((tab) => tab.displayName),
    tab: (name) => screen.getAllByRole('tab').find((tab) => tab.textContent?.includes(name))!,
  };
}

const rows = (): { label: string; disabled: boolean; run: () => unknown }[] => (openContextMenuGlobal.mock.calls.at(-1)?.[0] ?? [])
  .flatMap((entry) => (entry.type === 'item' ? [{ label: entry.label, disabled: entry.disabled === true, run: entry.onClick }] : []));

it('moves a tab one place to either side from the menu a long press opens, where a finger cannot drag it', () => {
  const { order, tab } = setup();
  use('touch');
  expect(fireEvent.contextMenu(tab('Crystal Caves'), { clientX: 140, clientY: 20 })).toBe(false);
  expect(openContextMenuGlobal.mock.calls[0]![1]).toEqual({ x: 140, y: 20 });
  expect(rows().map(({ label, disabled }) => [label, disabled])).toEqual([['Move left', false], ['Move right', false]]);
  act(() => { rows()[1]!.run(); });
  expect(order()).toEqual(['Tavern', 'Cave Entrance', 'Crystal Caves']);
  fireEvent.contextMenu(tab('Crystal Caves'));
  act(() => { rows()[0]!.run(); });
  expect(order()).toEqual(['Tavern', 'Crystal Caves', 'Cave Entrance']);
});

it('keeps both rows in place at the ends of the bar, the one that leads nowhere disabled', () => {
  const { tab } = setup();
  use('touch');
  fireEvent.contextMenu(tab('Tavern'));
  expect(rows().map(({ label, disabled }) => [label, disabled])).toEqual([['Move left', true], ['Move right', false]]);
  fireEvent.contextMenu(tab('Cave Entrance'));
  expect(rows().map(({ label, disabled }) => [label, disabled])).toEqual([['Move left', false], ['Move right', true]]);
  expect(sceneTabMoveEntries(0, 1, vi.fn()).every((entry) => entry.type === 'item' && entry.disabled)).toBe(true);
});

it('opens no menu for a mouse, which drags the tab, nor for the only tab', () => {
  const { tab } = setup();
  use('mouse');
  expect(fireEvent.contextMenu(tab('Crystal Caves'))).toBe(true);
  expect(openContextMenuGlobal).not.toHaveBeenCalled();
  cleanup();
  const one = setup(['Tavern']);
  use('touch');
  expect(fireEvent.contextMenu(one.tab('Tavern'))).toBe(true);
  expect(openContextMenuGlobal).not.toHaveBeenCalled();
});
