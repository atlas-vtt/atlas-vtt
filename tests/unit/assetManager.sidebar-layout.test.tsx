// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSidebarLayout } from '../../src/app/packages/components/asset-manager/hooks/useSidebarLayout';

// The asset manager window spans x 100–900, y 50–650 inside a full-screen modal root.
const WINDOW = { left: 100, right: 900, top: 50, bottom: 650 };
// The floating sidebar card, once shown.
const PANEL = { left: 108, right: 348, top: 58, bottom: 642 };

function rect(box: typeof WINDOW): DOMRect {
  return { ...box, x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top, toJSON: () => box } as DOMRect;
}

interface Setup {
  result: { current: ReturnType<typeof useSidebarLayout> };
  root: HTMLElement;
  panel: HTMLElement;
}

function setup(width: number): Setup {
  const root = document.body.createDiv();
  const container = root.createDiv();
  Object.defineProperty(container, 'offsetWidth', { configurable: true, value: width });
  container.getBoundingClientRect = (): DOMRect => rect(WINDOW);
  const panel = container.createDiv();
  panel.getBoundingClientRect = (): DOMRect => rect(PANEL);
  const containerRef = { current: container };
  const { result } = renderHook(() => {
    const layout = useSidebarLayout(containerRef, true);
    layout.panelRef.current = panel;
    return layout;
  });
  return { result, root, panel };
}

function moveTo(target: Element, clientX: number, clientY = 300): void {
  act(() => { target.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY, bubbles: true })); });
}

function wait(ms: number): void {
  act(() => { vi.advanceTimersByTime(ms); });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.empty();
});

it('docks on wide windows and the toggle undocks and docks it again', () => {
  const { result } = setup(1200);
  expect(result.current.isFloating).toBe(false);
  expect(result.current.toggleLabel).toBe('Hide sidebar');

  act(() => result.current.toggle());
  expect(result.current.isFloating).toBe(true);
  expect(result.current.isPeeking).toBe(false);
  expect(result.current.toggleLabel).toBe('Show sidebar');

  act(() => result.current.toggle());
  expect(result.current.isFloating).toBe(false);
});

it('floats on narrow windows, where the toggle pins it open until Escape', () => {
  const { result, root } = setup(800);
  expect(result.current.isFloating).toBe(true);

  act(() => result.current.toggle());
  expect(result.current.isPeeking).toBe(true);

  // A pinned sidebar stays open when the pointer wanders off.
  moveTo(root, 700);
  wait(1000);
  expect(result.current.isPeeking).toBe(true);

  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(result.current.isPeeking).toBe(false);
});

it('opens when the pointer rests near the left edge, also from outside the window', () => {
  const { result, root } = setup(800);

  // Passing by quickly does not open it.
  moveTo(root, 110);
  wait(40);
  moveTo(root, 400);
  wait(500);
  expect(result.current.isPeeking).toBe(false);

  // Overshooting past the window's edge onto the backdrop counts.
  moveTo(root, 40);
  expect(result.current.isNearEdge).toBe(true);
  wait(100);
  expect(result.current.isPeeking).toBe(true);
});

it('never opens from controls near the edge, like the sidebar button', () => {
  const { result, root } = setup(800);
  const button = root.createEl('button');
  moveTo(button, 115);
  wait(500);
  expect(result.current.isPeeking).toBe(false);
});

it('hides a hover peek after the pointer leaves the sidebar, unless it comes back', () => {
  const { result, root } = setup(800);
  moveTo(root, 105);
  wait(100);
  expect(result.current.isPeeking).toBe(true);

  moveTo(root, 300);
  wait(1000);
  expect(result.current.isPeeking).toBe(true);

  moveTo(root, 500);
  wait(150);
  moveTo(root, 300);
  wait(1000);
  expect(result.current.isPeeking).toBe(true);

  moveTo(root, 500);
  wait(300);
  expect(result.current.isPeeking).toBe(false);
});

it('stays open while a field inside has focus', () => {
  const { result, root, panel } = setup(800);
  const input = panel.createEl('input');
  moveTo(root, 105);
  wait(100);
  input.focus();
  moveTo(root, 500);
  wait(1000);
  expect(result.current.isPeeking).toBe(true);
});
