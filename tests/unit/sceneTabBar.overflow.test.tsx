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
  const onSwitchTab = vi.fn();
  const onMoveTab = (tabId: string, toIndex: number): void => { tabMetaStore.getState().moveTab(tabId, toIndex); };
  const value = { app: {}, view: { viewId: 'map', tabMetaStore }, pixiApp: null, renderer: null } as never;
  render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onSwitchTab={onSwitchTab} onMoveTab={onMoveTab} onCloseTab={vi.fn()} onAddTab={vi.fn()} onPresentTab={vi.fn()} onShowAllTabs={onShowAllTabs} />
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
  return { ids, strip, tabMetaStore, onShowAllTabs, onSwitchTab, layOut };
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

/** Lays the tabs out 116 px wide with 4 px gaps, the layout jsdom lacks, and makes frames wait. */
function layOutTabs(): HTMLElement[] {
  const tabs = screen.getAllByRole('tab');
  tabs.forEach((tab, index) => {
    Object.defineProperty(tab, 'offsetLeft', { configurable: true, value: index * 120 });
    Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: 116 });
    let captured = false;
    tab.setPointerCapture = vi.fn(() => { captured = true; });
    tab.hasPointerCapture = vi.fn(() => captured);
    tab.releasePointerCapture = vi.fn(() => { captured = false; });
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  return tabs;
}

function shiftOf(tab: HTMLElement): string {
  return tab.style.getPropertyValue('--atlas-tab-shift');
}

function pointer(target: EventTarget, type: string, clientX: number): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  act(() => { target.dispatchEvent(event); });
}

it('drags a tab past its neighbours, which slide aside, and drops it in their place without switching to it', () => {
  const { ids, tabMetaStore, onSwitchTab } = setup();
  const original = tabMetaStore.getState().tabs[0]!;
  const [first, second, third] = layOutTabs();

  pointer(first!, 'pointerdown', 50);
  pointer(window, 'pointermove', 52);
  expect(shiftOf(first!)).toBe('');
  pointer(window, 'pointermove', 200);
  expect(shiftOf(first!)).toBe('150px');
  expect(shiftOf(second!)).toBe('-120px');
  expect(shiftOf(third!)).toBe('');
  pointer(window, 'pointermove', 300);
  expect(shiftOf(third!)).toBe('-120px');

  pointer(first!, 'pointerup', 300);
  act(() => { fireEvent.click(first!); });

  expect(tabMetaStore.getState().tabs.map(tab => tab.id)).toEqual([ids[1], ids[2], ids[0]]);
  expect(tabMetaStore.getState().tabs[2]).toBe(original);
  expect(tabMetaStore.getState().activeTabId).toBe(ids[0]);
  expect(onSwitchTab).not.toHaveBeenCalled();
  expect(shiftOf(second!)).toBe('');
});

it('keeps a press that barely moves a click', () => {
  const { ids, tabMetaStore, onSwitchTab } = setup();
  const [, second] = layOutTabs();

  pointer(second!, 'pointerdown', 150);
  pointer(window, 'pointermove', 153);
  pointer(second!, 'pointerup', 153);
  fireEvent.click(second!);

  expect(tabMetaStore.getState().tabs.map(tab => tab.id)).toEqual(ids);
  expect(onSwitchTab).toHaveBeenCalledWith(ids[1]);
});

it('puts everything back on Escape, without the release switching scenes, and when the dragged tab is closed', () => {
  const { ids, tabMetaStore, onSwitchTab } = setup();
  const [first, second] = layOutTabs();

  pointer(first!, 'pointerdown', 50);
  pointer(window, 'pointermove', 200);
  act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
  expect(first!.releasePointerCapture).toHaveBeenCalled();
  pointer(first!, 'pointerup', 200);
  act(() => { fireEvent.click(first!); });
  expect(onSwitchTab).not.toHaveBeenCalled();
  expect(tabMetaStore.getState().tabs.map(tab => tab.id)).toEqual(ids);
  expect(shiftOf(first!)).toBe('');
  expect(shiftOf(second!)).toBe('');

  pointer(first!, 'pointerdown', 50);
  pointer(window, 'pointermove', 200);
  act(() => { tabMetaStore.getState().removeTab(ids[0]!); });
  pointer(window, 'pointerup', 200);
  expect(tabMetaStore.getState().tabs.map(tab => tab.id)).toEqual([ids[1], ids[2]]);
  expect(shiftOf(second!)).toBe('');
});

it('keeps dragging while a tab only finishes loading, and ends a press whose release was lost', () => {
  const { ids, tabMetaStore, onSwitchTab } = setup();
  const [first, second] = layOutTabs();

  pointer(first!, 'pointerdown', 50);
  pointer(window, 'pointermove', 200);
  act(() => { tabMetaStore.getState().markTabLoaded(ids[1]!); });
  expect(shiftOf(second!)).toBe('-120px');
  pointer(first!, 'pointerup', 200);
  act(() => { fireEvent.click(first!); });
  expect(tabMetaStore.getState().tabs.map(tab => tab.id)).toEqual([ids[1], ids[0], ids[2]]);
  expect(onSwitchTab).not.toHaveBeenCalled();

  pointer(second!, 'pointerdown', 150);
  const buttonless = new MouseEvent('pointermove', { bubbles: true, clientX: 400, buttons: 0 });
  Object.defineProperty(buttonless, 'pointerId', { value: 1 });
  act(() => { window.dispatchEvent(buttonless); });
  pointer(window, 'pointermove', 400);
  expect(shiftOf(second!)).toBe('');
  fireEvent.click(second!);
  expect(onSwitchTab).toHaveBeenCalledOnce();
});

it('does not take a tab dragged past the end for tabs that overflow, and measures the strip again once the tabs rest', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const { strip, layOut } = setup();
    layOut(300, 300);
    const [first] = layOutTabs();

    pointer(first!, 'pointerdown', 50);
    pointer(window, 'pointermove', 400);
    // The dragged tab's shift widens the scroll width; the tabs are no wider.
    layOut(380, 300);
    expect(screen.queryByRole('button', { name: 'All open maps' })).toBeNull();
    expect(strip.className).not.toMatch(/hidden-(before|after)/);

    pointer(first!, 'pointerup', 400);
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 600 });
    await act(async () => { vi.runAllTimers(); });
    expect(strip.dataset.reordering).toBeUndefined();
    expect(screen.getByRole('button', { name: 'All open maps' })).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});
