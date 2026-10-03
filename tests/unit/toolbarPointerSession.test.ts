import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  dragThreshold, ToolbarPointerSession, type ClientPoint, type PointerSessionHandlers,
} from '../../src/app/packages/components/toolbar/editor/toolbarPointerSession';

// jsdom has no PointerEvent: a mouse event of the pointer's type, with its id and kind.
function pointer(type: string, x: number, y: number, { id = 1, kind = 'mouse' }: { id?: number; kind?: string } = {}): PointerEvent {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: kind } });
  return event as PointerEvent;
}

interface Handlers extends PointerSessionHandlers {
  pickUp: Mock<(point: ClientPoint) => void>;
  move: Mock<(point: ClientPoint) => void>;
  drop: Mock<(point: ClientPoint) => void>;
  cancel: Mock<() => void>;
  release: Mock<() => void>;
}

function handlers(): Handlers {
  return {
    pickUp: vi.fn<(point: ClientPoint) => void>(),
    move: vi.fn<(point: ClientPoint) => void>(),
    drop: vi.fn<(point: ClientPoint) => void>(),
    cancel: vi.fn<() => void>(),
    release: vi.fn<() => void>(),
  };
}

describe('a press on a toolbar editor handle', () => {
  let bar: HTMLElement;
  let sessions: ToolbarPointerSession[] = [];
  const session = (press: PointerEvent, on: PointerSessionHandlers): ToolbarPointerSession => {
    const started = new ToolbarPointerSession(bar, press, on);
    sessions.push(started);
    return started;
  };

  beforeEach(() => {
    bar = document.body.createDiv();
  });

  afterEach(() => {
    sessions.forEach(started => started.cancel());
    sessions = [];
    bar.remove();
    document.body.removeClass('atlas-toolbar-grabbing');
  });

  it('becomes a drag past 4 px for a mouse and 8 px for a finger or pen', () => {
    expect(dragThreshold('mouse')).toBe(4);
    expect(dragThreshold('touch')).toBe(8);
    expect(dragThreshold('pen')).toBe(8);
    const on = handlers();
    session(pointer('pointerdown', 100, 100), on);
    window.dispatchEvent(pointer('pointermove', 103, 100));
    expect(on.pickUp).not.toHaveBeenCalled();
    window.dispatchEvent(pointer('pointermove', 104, 100));
    expect(on.pickUp).toHaveBeenCalledWith({ x: 104, y: 100 });
    expect(on.move).toHaveBeenCalledWith({ x: 104, y: 100 });
    expect(document.body.hasClass('atlas-toolbar-grabbing')).toBe(true);

    const touch = handlers();
    session(pointer('pointerdown', 0, 0, { id: 2, kind: 'touch' }), touch);
    window.dispatchEvent(pointer('pointermove', 6, 0, { id: 2, kind: 'touch' }));
    expect(touch.pickUp).not.toHaveBeenCalled();
  });

  it('keeps the pointer\'s moves and release from the map, and ignores other pointers', () => {
    const on = handlers();
    const map = vi.fn();
    document.addEventListener('pointermove', map);
    session(pointer('pointerdown', 0, 0), on);
    bar.dispatchEvent(pointer('pointermove', 10, 0, { id: 7 }));
    expect(on.pickUp).not.toHaveBeenCalled();
    expect(map).toHaveBeenCalledTimes(1);
    bar.dispatchEvent(pointer('pointermove', 10, 0));
    expect(map).toHaveBeenCalledTimes(1);
    bar.dispatchEvent(pointer('pointerup', 12, 0));
    expect(on.drop).toHaveBeenCalledWith({ x: 12, y: 0 });
    expect(document.body.hasClass('atlas-toolbar-grabbing')).toBe(false);
    // Over: nothing more is taken.
    bar.dispatchEvent(pointer('pointermove', 20, 0));
    expect(map).toHaveBeenCalledTimes(2);
    document.removeEventListener('pointermove', map);
  });

  it('ends a press without a drag as a release', () => {
    const on = handlers();
    session(pointer('pointerdown', 0, 0), on);
    window.dispatchEvent(pointer('pointerup', 1, 0));
    expect(on.release).toHaveBeenCalledTimes(1);
    expect(on.drop).not.toHaveBeenCalled();
  });

  it('cancels a drag on Escape, which goes no further, and lets Escape through before the threshold', () => {
    const on = handlers();
    session(pointer('pointerdown', 0, 0), on);
    window.dispatchEvent(pointer('pointermove', 10, 0));
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const later = vi.fn();
    window.addEventListener('keydown', later);
    document.body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
    expect(on.cancel).toHaveBeenCalledTimes(1);

    const pressed = handlers();
    session(pointer('pointerdown', 0, 0), pressed);
    const early = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false);
    expect(later).toHaveBeenCalledTimes(1);
    expect(pressed.release).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', later);
  });

  it('cancels a drag when the pointer is cancelled or lost, or the window loses focus', () => {
    for (const end of [
      (): boolean => window.dispatchEvent(pointer('pointercancel', 10, 0)),
      (): boolean => bar.dispatchEvent(pointer('lostpointercapture', 10, 0)),
      (): boolean => window.dispatchEvent(new FocusEvent('blur')),
    ]) {
      const on = handlers();
      session(pointer('pointerdown', 0, 0), on);
      window.dispatchEvent(pointer('pointermove', 10, 0));
      end();
      expect(on.cancel).toHaveBeenCalledTimes(1);
      window.dispatchEvent(pointer('pointerup', 10, 0));
      expect(on.drop).not.toHaveBeenCalled();
    }
  });

  it('captures the pointer on the bar only once the press is a drag, and keeps a context menu from opening during one', () => {
    const capture = vi.fn<(pointerId: number) => void>();
    Object.assign(bar, { setPointerCapture: capture, hasPointerCapture: () => false, releasePointerCapture: vi.fn() });
    session(pointer('pointerdown', 0, 0), handlers());
    window.dispatchEvent(pointer('pointermove', 2, 0));
    expect(capture).not.toHaveBeenCalled();
    // Before the threshold the menu a press opens (Ctrl+click on macOS, a long press) is the handle's to take.
    const early = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    bar.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false);

    window.dispatchEvent(pointer('pointermove', 10, 0));
    expect(capture).toHaveBeenCalledWith(1);
    const during = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    bar.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
  });

  it('lets a context menu end the press before the threshold (Ctrl+click on macOS), never during a drag', () => {
    const on = handlers();
    const press = session(pointer('pointerdown', 0, 0), on);
    expect(press.allowContextMenu()).toBe(true);
    expect(on.release).toHaveBeenCalledTimes(1);
    window.dispatchEvent(pointer('pointermove', 10, 0));
    expect(on.pickUp).not.toHaveBeenCalled();

    const dragged = handlers();
    const drag = session(pointer('pointerdown', 0, 0), dragged);
    window.dispatchEvent(pointer('pointermove', 10, 0));
    expect(drag.allowContextMenu()).toBe(false);
    expect(drag.isDragging).toBe(true);
    window.dispatchEvent(pointer('pointerup', 10, 0));
    expect(dragged.drop).toHaveBeenCalledTimes(1);
  });
});
