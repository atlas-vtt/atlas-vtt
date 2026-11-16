// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useMoodDrag } from '../../../src/app/react/components/dm-screen/sound/useMoodDrag';
import { VerticalFader } from '../../../src/app/react/components/dm-screen/sound/VerticalFader';
import type { Mood } from '../../../src/app/sound/soundTypes';

const mood = (id: string, order: number): Mood => ({ id, name: id, order, fadeSeconds: 1, music: 'none', layers: [] });
const MOODS = [mood('a', 1), mood('b', 2), mood('c', 3)];

let grid: HTMLElement;
let visible: boolean;

function pointer(type: string, x: number, y: number): void {
  document.dispatchEvent(Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }), { pointerId: 1 }));
}

beforeEach(() => {
  visible = true;
  grid = document.body.createDiv();
  grid.getClientRects = () => (visible ? [{}] : []) as unknown as DOMRectList;
  MOODS.forEach((_, index) => {
    const card = grid.createDiv({ cls: 'atlas-sound-mood' });
    card.getBoundingClientRect = () => (visible ? { left: index * 200, top: 0, width: 190, height: 116 } : { left: 0, top: 0, width: 0, height: 0 }) as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  grid.remove();
});

function pressed(onDrop: (moved: Mood, index: number) => void): { unmount: () => void; shown: () => readonly Mood[] } {
  const { result, unmount } = renderHook(() => useMoodDrag({ current: grid }, MOODS, () => true, onDrop));
  act(() => result.current.start(MOODS[2]!, { button: 0, clientX: 490, clientY: 50, pointerId: 1 } as ReactPointerEvent<HTMLElement>));
  return { unmount, shown: () => result.current.shown };
}

describe('a mood held under the pointer', () => {
  it('lands where it is let go', () => {
    const onDrop = vi.fn();
    pressed(onDrop);
    act(() => pointer('pointermove', 290, 50));
    act(() => pointer('pointerup', 290, 50));
    expect(onDrop).toHaveBeenCalledWith(MOODS[2], 1);
  });

  it('changes nothing where the grid goes while it is held and the pointer stands', () => {
    const onDrop = vi.fn();
    pressed(onDrop);
    act(() => pointer('pointermove', 290, 50));
    visible = false;
    act(() => pointer('pointerup', 290, 50));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('changes nothing where the grid goes while it is held and the pointer moves on', () => {
    const onDrop = vi.fn();
    const { shown } = pressed(onDrop);
    act(() => pointer('pointermove', 290, 50));
    visible = false;
    act(() => pointer('pointermove', 300, 50));
    expect(shown()).toEqual(MOODS);
    visible = true;
    act(() => pointer('pointermove', 90, 50));
    act(() => pointer('pointerup', 90, 50));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('leaves nothing listening once its page is gone', () => {
    const onDrop = vi.fn();
    const { unmount } = pressed(onDrop);
    act(() => pointer('pointermove', 290, 50));
    unmount();
    act(() => pointer('pointermove', 90, 50));
    act(() => pointer('pointerup', 90, 50));
    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe('a fader held under the pointer', () => {
  it('commits what it was set to once, where its page goes during the drag', () => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const onCommit = vi.fn();
    const { container, unmount } = render(<VerticalFader label="Music" value={0} meter="music" onChange={() => undefined} onCommit={onCommit} />);
    const track = container.querySelector('.atlas-sound-fader')!;
    fireEvent(track, Object.assign(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientY: 10 }), { pointerId: 1 }));
    unmount();
    expect(onCommit).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  });
});
