// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
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

function setup() {
  const tabMetaStore = createTabMetaStore();
  const ids = ['Tavern', 'Crystal Caves', 'Cave Entrance'].map(name => tabMetaStore.getState().addTab(`${name}.atlasmap`, name));
  tabMetaStore.getState().setActiveTab(ids[0]!);
  const onShowAllTabs = vi.fn();
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={vi.fn()} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={vi.fn()} onShowAllTabs={onShowAllTabs} />
  </AtlasUIContext.Provider>);
  const strip = screen.getByRole('tablist');
  /** Gives the strip the layout jsdom lacks and lets the bar measure it. */
  const layOut = (scrollWidth: number, clientWidth: number, scrollLeft = 0): void => {
    let left = scrollLeft;
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: scrollWidth });
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: clientWidth });
    Object.defineProperty(strip, 'scrollLeft', { configurable: true, get: () => left, set: (next: number) => { left = next; } });
    act(() => { fireEvent.scroll(strip); });
  };
  return { ids, strip, tabMetaStore, onShowAllTabs, layOut };
}

it('offers the list of open maps and fades the cut-off edges only while the tabs overflow', () => {
  const { strip, onShowAllTabs, layOut } = setup();
  layOut(300, 300);
  expect(screen.queryByRole('button', { name: 'All open maps' })).toBeNull();
  expect(strip.className).not.toMatch(/hidden-(before|after)/);

  layOut(600, 300);
  expect(strip.className).toContain('atlas-scene-tab-bar__strip--hidden-after');
  expect(strip.className).not.toContain('--hidden-before');
  fireEvent.click(screen.getByRole('button', { name: 'All open maps' }));
  expect(onShowAllTabs).toHaveBeenCalledOnce();

  layOut(600, 300, 300);
  expect(strip.className).toContain('atlas-scene-tab-bar__strip--hidden-before');
  expect(strip.className).not.toContain('--hidden-after');
});

it('scrolls sideways with a vertical mouse wheel and leaves horizontal scrolling to the trackpad', () => {
  const { strip, layOut } = setup();
  layOut(600, 300);

  const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
  strip.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(100);

  const lines = new WheelEvent('wheel', { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE, cancelable: true });
  strip.dispatchEvent(lines);
  expect(strip.scrollLeft).toBe(148);

  const swipe = new WheelEvent('wheel', { deltaX: 40, deltaY: 5, cancelable: true });
  strip.dispatchEvent(swipe);
  expect(swipe.defaultPrevented).toBe(false);
  expect(strip.scrollLeft).toBe(148);
});

it('leaves the wheel alone while every tab fits', () => {
  const { strip, layOut } = setup();
  layOut(300, 300);
  const wheel = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
  strip.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
});

it('scrolls the active tab into view, at once on mount and smoothly on later switches', () => {
  const { ids, tabMetaStore } = setup();
  const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
  expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ inline: 'nearest', behavior: 'auto' }));
  expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByRole('tab', { name: /Tavern/ }));

  act(() => { tabMetaStore.getState().setActiveTab(ids[2]!); });
  expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ inline: 'nearest', behavior: 'smooth' }));
  expect(scrollIntoView.mock.contexts.at(-1)).toBe(screen.getByRole('tab', { name: /Cave Entrance/ }));
});

it('keeps the player view and close buttons at opposite ends of a tab, with the name between them', () => {
  setup();
  const tab = screen.getAllByRole('tab')[0]!;
  const [show, close] = tab.querySelectorAll('.atlas-scene-tab__action');
  const name = tab.querySelector('.atlas-scene-tab__name')!;
  expect(show!.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(name.compareDocumentPosition(close!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
