// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DRAG_GROUP_ATTRIBUTE, useRowDrag } from '../../src/app/react/hooks/useRowDrag';

/** A column of places 40 px apart, each in a group. */
function column(groups: (string | null)[]): Element[] {
  return groups.map((group, index) => {
    const element = document.createElement('div');
    if (group !== null) element.setAttribute(DRAG_GROUP_ATTRIBUTE, group);
    element.getBoundingClientRect = () => ({ left: 0, top: index * 40, width: 40, height: 40 }) as DOMRect;
    return element;
  });
}

function pointer(y: number, buttons = 1): React.PointerEvent<HTMLElement> {
  const target = document.createElement('div');
  target.setPointerCapture = vi.fn();
  return { button: 0, buttons, pointerId: 1, clientX: 20, clientY: y, currentTarget: target } as unknown as React.PointerEvent<HTMLElement>;
}

describe('useRowDrag', () => {
  it('slides the places between aside and moves the held one on release', () => {
    const onMove = vi.fn();
    const places = column([null, null, null]);
    const { result } = renderHook(() => useRowDrag(() => places, onMove));
    act(() => result.current.onPointerDown(0, pointer(20)));
    act(() => result.current.onPointerMove(pointer(100)));
    expect(result.current.held).toBe(0);
    expect(result.current.offsetOf(1)).toBe('0px -40px');
    expect(result.current.offsetOf(2)).toBe('0px -40px');
    act(() => result.current.onPointerUp(pointer(100)));
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('lands only among the held place\'s group', () => {
    const onMove = vi.fn();
    const places = column(['a', 'a', 'b']);
    const { result } = renderHook(() => useRowDrag(() => places, onMove));
    act(() => result.current.onPointerDown(0, pointer(20)));
    act(() => result.current.onPointerMove(pointer(100)));
    expect(result.current.offsetOf(2)).toBe('0 0');
    act(() => result.current.onPointerUp(pointer(100)));
    expect(onMove).toHaveBeenCalledWith(0, 1);
  });

  it('moves a vertical list\'s held place up and down only', () => {
    const places = column([null, null]);
    const { result } = renderHook(() => useRowDrag(() => places, vi.fn(), { axis: 'vertical' }));
    act(() => result.current.onPointerDown(0, pointer(20)));
    act(() => result.current.onPointerMove({ ...pointer(60), clientX: 90 }));
    expect(result.current.offsetOf(0)).toBe('0px 40px');
  });

  it('stops the held place at the first and last places of its group', () => {
    const places = column(['a', 'a', 'a', 'b']);
    const { result } = renderHook(() => useRowDrag(() => places, vi.fn(), { axis: 'vertical' }));
    act(() => result.current.onPointerDown(1, pointer(60)));
    act(() => result.current.onPointerMove(pointer(400)));
    expect(result.current.offsetOf(1)).toBe('0px 40px');
    act(() => result.current.onPointerMove(pointer(-400)));
    expect(result.current.offsetOf(1)).toBe('0px -40px');
  });

  it('drops nothing for a click or a press let go elsewhere', () => {
    const onMove = vi.fn();
    const places = column([null, null]);
    const { result } = renderHook(() => useRowDrag(() => places, onMove));
    act(() => result.current.onPointerDown(0, pointer(20)));
    act(() => result.current.onPointerUp(pointer(21)));
    act(() => result.current.onPointerDown(0, pointer(20)));
    act(() => result.current.onPointerMove(pointer(100, 0)));
    expect(result.current.held).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });

  it('scrolls its list on while held near the bottom edge, and the held place goes along', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const box = document.createElement('div');
    box.getBoundingClientRect = () => ({ top: 0, bottom: 100 }) as DOMRect;
    box.scrollTo = ((options: ScrollToOptions) => { box.scrollTop = options.top ?? 0; }) as typeof box.scrollTo;
    const places = column([null, null, null, null, null]);
    const { result } = renderHook(() => useRowDrag(() => places, vi.fn(), { axis: 'vertical', scroller: () => box }));
    act(() => result.current.onPointerDown(1, pointer(60)));
    act(() => result.current.onPointerMove(pointer(95)));
    act(() => frames.shift()?.(0));
    expect(box.scrollTop).toBeGreaterThan(0);
    expect(result.current.offsetOf(1)).toBe(`0px ${35 + box.scrollTop}px`);
    vi.restoreAllMocks();
  });
});
