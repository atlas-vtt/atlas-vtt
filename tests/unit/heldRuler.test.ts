// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { measureWhileHeld } from '../../src/app/packages/components/toolbar/measureWhileHeld';
import { measureToolInUse, shownTool } from '../../src/app/measure/heldRuler';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function follow(): { calls: string[]; map: HTMLCanvasElement } {
  const calls: string[] = [];
  const map = document.createElement('canvas');
  document.body.append(map);
  measureWhileHeld(new KeyboardEvent('keydown', { code: 'KeyM' }), {
    onMap: (target) => target === map,
    tap: () => calls.push('tap'),
    press: () => calls.push('press'),
    release: () => calls.push('release'),
  });
  return { calls, map };
}
const keyUp = (): boolean => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyM' }));
const down = (target: EventTarget, button = 0): boolean => target.dispatchEvent(new MouseEvent('pointerdown', { button, bubbles: true }));
const up = (): boolean => window.dispatchEvent(new MouseEvent('pointerup'));

describe('the measure key held', () => {
  it('is a tap when it goes up with no press on the map, however long it was down', () => {
    const { calls } = follow();
    down(document.body);
    down(window, 2);
    up();
    keyUp();
    expect(calls).toEqual(['tap']);
  });

  it('holds a ruler from a press on the map until key and button are both up, in either order', () => {
    const first = follow();
    down(first.map);
    keyUp();
    expect(first.calls).toEqual(['press']);
    up();
    expect(first.calls).toEqual(['press', 'release']);

    const second = follow();
    down(second.map);
    up();
    down(second.map);
    up();
    expect(second.calls).toEqual(['press']);
    keyUp();
    expect(second.calls).toEqual(['press', 'release']);
  });

  it('lets go when the window loses focus, and taps nothing then', () => {
    const held = follow();
    down(held.map);
    window.dispatchEvent(new Event('blur'));
    expect(held.calls).toEqual(['press', 'release']);
    const idle = follow();
    window.dispatchEvent(new Event('blur'));
    keyUp();
    expect(idle.calls).toEqual([]);
  });
});

describe('the held ruler in the store', () => {
  const store = (): ReturnType<typeof createViewAtlasStore> => {
    const made = createViewAtlasStore(createInMemoryApp({ files: {} }).app, `held-ruler-${Math.random()}`);
    made.getState().setPersistenceEnabled(false);
    return made;
  };

  it('measures with a ruler that keeps nothing while the toolbar shows the tool that waits, and gives that tool back', () => {
    const s = store();
    s.getState().setActiveTool('fog');
    s.getState().setMeasureTool({ mode: 'cone', keep: true });
    s.getState().holdRuler();
    expect(s.getState().activeTool).toBe('measure');
    expect(shownTool(s.getState())).toBe('fog');
    expect(measureToolInUse(s.getState())).toMatchObject({ mode: 'ruler', keep: false });
    s.getState().releaseRuler();
    expect(s.getState().activeTool).toBe('fog');
    expect(measureToolInUse(s.getState())).toMatchObject({ mode: 'cone', keep: true });
  });

  it('keeps a tool picked during the hold', () => {
    const s = store();
    s.getState().holdRuler();
    s.getState().setActiveTool('draw');
    s.getState().releaseRuler();
    expect(s.getState().activeTool).toBe('draw');
    expect(shownTool(s.getState())).toBe('draw');
  });
});
