// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { corners, setup, tearDown, type Setup } from './lightZoneEditorHarness';

describe('a corner of a light zone', () => {
  it('moves a corner that is dragged, as one undo step, and puts it back when the drag is cancelled', () => {
    const made = setup();
    corners(made);
    made.editor.handleEnter();
    const steps = made.steps();
    expect(made.editor.pointerDown({ x: 301, y: 299 }, { altKey: false })).toBe(true);
    made.editor.pointerMove({ x: 350, y: 340 }, { altKey: false });
    made.editor.pointerMove({ x: 400, y: 380 }, { altKey: false });
    expect(made.zones()[0]!.polygon[2]).toEqual({ x: 400, y: 380 });
    made.editor.pointerUp();
    expect(made.steps()).toBe(steps + 1);
    made.undo();
    expect(made.zones()[0]!.polygon[2]).toEqual({ x: 300, y: 300 });

    made.editor.pointerDown({ x: 300, y: 300 }, { altKey: false });
    made.editor.pointerMove({ x: 500, y: 500 }, { altKey: false });
    expect(made.editor.handleEscape()).toBe(true);
    expect(made.zones()[0]!.polygon[2]).toEqual({ x: 300, y: 300 });
    expect(made.steps()).toBe(steps);
  });

  describe('a corner drag that never gets its release', () => {
    /** A closed square whose corner (300, 300) is held and moved to (400, 380). */
    function dragging(): Setup & { steps0: number } {
      const made = setup();
      corners(made);
      made.editor.handleEnter();
      const steps0 = made.steps();
      made.editor.pointerDown({ x: 300, y: 300 }, { altKey: false });
      made.editor.pointerMove({ x: 400, y: 380 }, { altKey: false });
      expect(made.zones()[0]!.polygon[2]).toEqual({ x: 400, y: 380 });
      return { ...made, steps0 };
    }

    /** The corner is back, follows the pointer no more, and the next edit of the map is one undo step again. */
    function expectDropped(made: Setup & { steps0: number }): void {
      expect(made.zones()[0]!.polygon[2]).toEqual({ x: 300, y: 300 });
      expect(made.steps()).toBe(made.steps0);
      made.editor.pointerMove({ x: 450, y: 450 }, { altKey: false });
      expect(made.zones()[0]!.polygon[2]).toEqual({ x: 300, y: 300 });
      made.store.getState().addWall({ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, closed: true });
      expect(made.steps()).toBe(made.steps0 + 1);
    }

    it('is cancelled when the pointer is cancelled', () => {
      const made = dragging();
      made.canvas.dispatchEvent(new Event('pointercancel'));
      expectDropped(made);
    });

    it('is cancelled when the window loses focus', () => {
      const made = dragging();
      window.dispatchEvent(new Event('blur'));
      expectDropped(made);
    });

    it('is cancelled by the next press, which starts a drag of its own: one undo step for it, and later edits count again', () => {
      const made = dragging();
      made.editor.pointerDown({ x: 100, y: 100 }, { altKey: false });
      expect(made.zones()[0]!.polygon[2]).toEqual({ x: 300, y: 300 });
      made.editor.pointerMove({ x: 60, y: 70 }, { altKey: false });
      made.editor.pointerUp();
      expect(made.zones()[0]!.polygon).toMatchObject([{ x: 60, y: 70 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]);
      expect(made.steps()).toBe(made.steps0 + 1);
      made.store.getState().addWall({ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, closed: true });
      expect(made.steps()).toBe(made.steps0 + 2);
    });

    it('is cancelled when the editor is destroyed, and listens no longer', () => {
      const made = dragging();
      tearDown();
      expect(made.zones()[0]!.polygon[2]).toEqual({ x: 300, y: 300 });
      expect(made.steps()).toBe(made.steps0);
      made.store.getState().addWall({ type: 'solid', p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, closed: true });
      expect(made.steps()).toBe(made.steps0 + 1);
    });

    it('listens for a lost pointer only while a corner is held', () => {
      const made = setup();
      corners(made);
      made.editor.handleEnter();
      made.editor.pointerDown({ x: 300, y: 300 }, { altKey: false });
      made.editor.pointerMove({ x: 400, y: 380 }, { altKey: false });
      made.editor.pointerUp();
      const steps = made.steps();
      made.canvas.dispatchEvent(new Event('pointercancel'));
      window.dispatchEvent(new Event('blur'));
      expect(made.zones()[0]!.polygon[2]).toEqual({ x: 400, y: 380 });
      expect(made.steps()).toBe(steps);
    });
  });
});
