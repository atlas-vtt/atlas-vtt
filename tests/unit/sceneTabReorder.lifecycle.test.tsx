// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneTabBar } from '../../src/app/react/components/SceneTabBar';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { createTabMetaStore } from '../../src/app/stores/tabMetaStore';

// Browser layout/real input is covered by sceneTabReorder.gpu.test.ts. These integration
// tests cover the otherwise missing input gates and terminal lifecycle transitions.
const pendingFrames = new Map<number, FrameRequestCallback>();
const resizeObservers: Array<{ observing: boolean }> = [];
let nextFrame = 0;
let originalScrollIntoView: PropertyDescriptor | undefined;

beforeEach(() => {
  originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.stubGlobal('ResizeObserver', class {
    observing = false;
    constructor() { resizeObservers.push(this); }
    observe(): void { this.observing = true; }
    disconnect(): void { this.observing = false; }
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    const id = ++nextFrame;
    pendingFrames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number): void => { pendingFrames.delete(id); });
});

afterEach(() => {
  cleanup();
  pendingFrames.clear();
  resizeObservers.length = 0;
  document.body.classList.remove('atlas-toolbar-grabbing');
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals();
});

interface PointerOptions { id?: number; kind?: string; primary?: boolean; button?: number; ctrlKey?: boolean }

/** jsdom has no PointerEvent; preserve the real pointer fields on a bubbling mouse event. */
function pointer(target: EventTarget, type: string, x: number, options: PointerOptions = {}): PointerEvent {
  const { id = 1, kind = 'mouse', primary = true, button = 0, ctrlKey = false } = options;
  const event = new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: 64, button, ctrlKey,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : button === 1 ? 4 : button === 2 ? 2 : 1,
  });
  Object.defineProperties(event, {
    pointerId: { value: id }, pointerType: { value: kind }, isPrimary: { value: primary },
  });
  act(() => { target.dispatchEvent(event); });
  return event as PointerEvent;
}

function setup() {
  const store = createTabMetaStore();
  const ids = ['Amber Keep', 'Blue Cave', 'Copper Wood', 'Distant Gate'].map((name) => store.getState().addTab(`${name}.atlasmap`, name));
  store.getState().setActiveTab(ids[1]!);
  const move = vi.fn((id: string, beforeId: string | null) => store.getState().moveTab(id, beforeId));
  const switchTab = vi.fn();
  const present = vi.fn();
  const close = vi.fn();
  const value = { app: {}, view: { viewId: 'scene-lifecycle', tabMetaStore: store }, pixiApp: null, renderer: null } as never;
  const rendered = render(<AtlasUIContext.Provider value={value}>
    <SceneTabBar onMoveTab={move} onSwitchTab={switchTab} onPresentTab={present} onCloseTab={close}
      onAddTab={vi.fn()} onShowAllTabs={vi.fn()} presentedTabId={ids[1]!} />
  </AtlasUIContext.Provider>);
  const strip = screen.getByRole('tablist');
  strip.getBoundingClientRect = () => new DOMRect(100, 50, 400, 28);
  Object.defineProperties(strip, { clientWidth: { configurable: true, value: 400 }, scrollWidth: { configurable: true, value: 492 } });
  const tabs = screen.getAllByRole('tab');
  for (const [index, tab] of tabs.entries()) tab.getBoundingClientRect = () => new DOMRect(100 + index * 124 - strip.scrollLeft, 50, 120, 28);
  const captured = new Set<number>();
  const capture = vi.fn((id: number) => { captured.add(id); });
  const release = vi.fn((id: number) => { captured.delete(id); });
  Object.assign(strip, { setPointerCapture: capture, hasPointerCapture: (id: number) => captured.has(id), releasePointerCapture: release });
  const source = tabs[0]!;
  const name = source.querySelector<HTMLElement>('.atlas-scene-tab__name')!;
  return {
    ...rendered, store, ids, strip, source, name, captured, capture, release, move, switchTab, present, close,
    order: () => store.getState().tabs.map((tab) => tab.id),
    dragging: () => document.body.classList.contains('atlas-toolbar-grabbing'),
  };
}

describe('scene-tab pointer eligibility and terminal lifecycle', () => {
  it('leaves touch, nonprimary, Ctrl-context, and non-left presses alone while middle click still closes', () => {
    const fixture = setup();
    const movesOutside = vi.fn();
    document.addEventListener('pointermove', movesOutside);
    try {
      for (const options of [
        { kind: 'touch' }, { primary: false }, { ctrlKey: true }, { button: 1 }, { button: 2 },
      ] satisfies PointerOptions[]) {
        const down = pointer(fixture.name, 'pointerdown', 160, options);
        pointer(document.body, 'pointermove', 480, options);
        pointer(document.body, 'pointerup', 480, options);
        expect(down.defaultPrevented).toBe(false);
        expect(fixture.dragging()).toBe(false);
        expect(fixture.capture).not.toHaveBeenCalled();
      }
      expect(movesOutside).toHaveBeenCalledTimes(5);
      expect(fixture.move).not.toHaveBeenCalled();
      expect(fixture.order()).toEqual(fixture.ids);
      fireEvent.mouseDown(fixture.name, { button: 1 });
      expect(fixture.close).toHaveBeenCalledExactlyOnceWith(fixture.ids[0]);
      expect(fixture.switchTab).not.toHaveBeenCalled();
      expect(fixture.present).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('pointermove', movesOutside);
    }
  });

  it('uses the pen threshold and keeps the pointer captured on the strip until its valid drop', () => {
    const fixture = setup();
    const pen = { kind: 'pen', id: 23 };
    pointer(fixture.name, 'pointerdown', 160, pen);
    pointer(document.body, 'pointermove', 167, pen);
    expect(fixture.dragging()).toBe(false);
    expect(fixture.capture).not.toHaveBeenCalled();
    pointer(document.body, 'pointermove', 168, pen);
    expect(fixture.dragging()).toBe(true);
    expect(fixture.capture).toHaveBeenCalledExactlyOnceWith(23);
    expect(fixture.order()).toEqual(fixture.ids);
    expect(fixture.move).not.toHaveBeenCalled();
    pointer(document.body, 'pointermove', 480, pen);
    pointer(document.body, 'pointerup', 480, pen);
    expect(fixture.move).toHaveBeenCalledExactlyOnceWith(fixture.ids[0], fixture.ids[3]);
    expect(fixture.order()).toEqual([fixture.ids[1], fixture.ids[2], fixture.ids[0], fixture.ids[3]]);
    expect(fixture.store.getState().activeTabId).toBe(fixture.ids[1]);
    expect(fixture.dragging()).toBe(false);
    expect(fixture.captured.size).toBe(0);
    expect(fixture.switchTab).not.toHaveBeenCalled();
    expect(fixture.present).not.toHaveBeenCalled();
    expect(fixture.close).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).not.toContain('canceled');
  });

  it('cancels a lost capture, preserves focus and order, and accepts the next click and drag', () => {
    const fixture = setup();
    fixture.source.focus();
    pointer(fixture.name, 'pointerdown', 160);
    pointer(document.body, 'pointermove', 480);
    expect(fixture.dragging()).toBe(true);
    // Native lostpointercapture arrives after the browser has already relinquished capture.
    fixture.captured.clear();
    pointer(fixture.strip, 'lostpointercapture', 480);
    pointer(document.body, 'pointerup', 480);
    expect(fixture.dragging()).toBe(false);
    expect(fixture.order()).toEqual(fixture.ids);
    expect(fixture.move).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(fixture.source);
    expect(screen.getByRole('status').textContent).toContain('canceled');

    expect(fixture.name.isConnected).toBe(true);
    pointer(fixture.name, 'pointerdown', 160, { id: 2 });
    pointer(document.body, 'pointerup', 160, { id: 2 });
    fireEvent.click(fixture.source, { detail: 1 });
    expect(fixture.switchTab).toHaveBeenCalledExactlyOnceWith(fixture.ids[0]);
    fixture.switchTab.mockClear();
    pointer(fixture.name, 'pointerdown', 160, { id: 3 });
    pointer(document.body, 'pointermove', 480, { id: 3 });
    pointer(document.body, 'pointerup', 480, { id: 3 });
    expect(fixture.move).toHaveBeenCalledExactlyOnceWith(fixture.ids[0], fixture.ids[3]);
    expect(fixture.switchTab).not.toHaveBeenCalled();
  });

  it('unmounts a held edge drag without committing, retaining capture, a scroll frame, or global event interception', () => {
    const fixture = setup();
    pointer(fixture.name, 'pointerdown', 160);
    pointer(document.body, 'pointermove', 498);
    expect(fixture.dragging()).toBe(true);
    expect(fixture.captured.has(1)).toBe(true);
    expect(pendingFrames.size).toBeGreaterThan(0);
    fixture.unmount();
    expect(fixture.dragging()).toBe(false);
    expect(fixture.captured.size).toBe(0);
    expect(pendingFrames.size).toBe(0);
    expect(resizeObservers.every((observer) => !observer.observing)).toBe(true);
    expect(fixture.order()).toEqual(fixture.ids);
    expect(fixture.move).not.toHaveBeenCalled();

    const mapEvent = vi.fn();
    for (const type of ['pointermove', 'pointerup', 'click', 'keydown']) document.addEventListener(type, mapEvent);
    try {
      pointer(document.body, 'pointermove', 498);
      pointer(document.body, 'pointerup', 498);
      fireEvent.click(document.body, { detail: 1 });
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(mapEvent).toHaveBeenCalledTimes(4);
      expect(fixture.move).not.toHaveBeenCalled();
      expect(fixture.switchTab).not.toHaveBeenCalled();
    } finally {
      for (const type of ['pointermove', 'pointerup', 'click', 'keydown']) document.removeEventListener(type, mapEvent);
    }
  });
});
