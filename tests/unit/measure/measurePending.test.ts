// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { measureScene, type MeasureScene } from '../../helpers/measureScene';

let current: MeasureScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
  document.body.empty();
});

/** A measurement placed click by click that waits for its next click: one click made, in a map whose canvas stands in a tab. */
function pending(keep = false): MeasureScene & { canvas: HTMLElement; tab: HTMLElement } {
  const s = measureScene();
  current = s;
  const canvas: HTMLElement = s.viewport.options.events.domElement;
  const tab = document.body.createDiv({ cls: 'workspace-leaf' });
  tab.appendChild(canvas);
  s.store.getState().setActiveTool('measure');
  s.store.getState().setMeasureTool({ keep });
  s.click(105, 105);
  s.pointer('pointermove', 315, 105);
  expect(s.measure.measurements.get().live).not.toBeNull();
  return Object.assign(s, { canvas, tab });
}

const waiting = (s: MeasureScene): boolean => s.measure.measurements.get().live !== null;
const kept = (s: MeasureScene): number => Object.keys(s.store.getState().objects.measures ?? {}).length;
/** No key is held any more: Space, Enter, Backspace and Escape reach whoever they are for. */
function expectKeysFree(s: MeasureScene): void {
  for (const key of [' ', 'Enter', 'Backspace', 'Escape']) expect(s.key(key).defaultPrevented, key).toBe(false);
}

describe('a measurement that waits for its next click', () => {
  it('holds its keys while the map has the keyboard', () => {
    const s = pending();
    expect(s.key(' ').defaultPrevented).toBe(true);
    expect(waiting(s)).toBe(true);
  });

  it('is dropped by a key that is not the map\'s, which is left alone: another tab in front, a dialog or the DM screen over the map', () => {
    const s = pending(true);
    let maps = true;
    s.measure.keysBelongToMap = () => maps;
    expect(s.key(' ').defaultPrevented).toBe(true);
    maps = false;
    // Enter would finish it, and with Keep on write it to the scene.
    expect(s.key('Enter').defaultPrevented).toBe(false);
    expect(waiting(s)).toBe(false);
    expect(kept(s)).toBe(0);
    maps = true;
    expectKeysFree(s);
  });

  it('leaves a key typed into a field to the field, and goes on waiting', () => {
    const s = pending();
    s.measure.keysBelongToMap = () => false;
    const field = s.tab.createEl('input');
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(waiting(s)).toBe(true);
  });

  it('is dropped when the window loses focus', () => {
    const s = pending(true);
    window.dispatchEvent(new Event('blur'));
    expect(waiting(s)).toBe(false);
    expectKeysFree(s);
    expect(kept(s)).toBe(0);
  });

  it('is dropped by a press anywhere but on the canvas, and by none on it', () => {
    const s = pending(true);
    s.canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(waiting(s)).toBe(true);
    const bar = document.body.createDiv();
    bar.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(waiting(s)).toBe(false);
    expectKeysFree(s);
    expect(kept(s)).toBe(0);
  });

  it('is dropped when focus goes to something outside the map\'s tab, and not by focus within it', () => {
    const s = pending();
    s.tab.createEl('button').dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(waiting(s)).toBe(true);
    const dialog = document.body.createDiv({ cls: 'modal-container' });
    dialog.createEl('button').dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(waiting(s)).toBe(false);
    expectKeysFree(s);
  });

  it('is dropped when the view is left: another tab comes to the front, or the scene unloads', () => {
    const s = pending(true);
    s.measure.leave();
    expect(waiting(s)).toBe(false);
    expectKeysFree(s);
    expect(kept(s)).toBe(0);
  });

  it('is dropped when the DM screen, the command palette or the asset manager opens over the map', () => {
    for (const open of [
      (s: MeasureScene): void => s.store.getState().setDMScreenOpen(true),
      (s: MeasureScene): void => s.store.getState().setCommandPaletteOpen(true),
      (s: MeasureScene): void => s.store.getState().openAssetManager(),
    ]) {
      const s = pending(true);
      open(s);
      expect(waiting(s)).toBe(false);
      expectKeysFree(s);
      expect(kept(s)).toBe(0);
      s.destroy();
      current = undefined;
    }
  });

  it('leaves no undo step and stops listening once it is dropped: what follows is no business of the tool', () => {
    const s = pending(true);
    s.measure.leave();
    // Nothing waits any more: presses and focus elsewhere, and a window that loses focus, change nothing.
    document.body.createDiv().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(waiting(s)).toBe(false);
    expect(kept(s)).toBe(0);
    // The next measurement is made as ever.
    s.click(105, 105);
    s.pointer('pointermove', 315, 105);
    expect(s.key('Enter').defaultPrevented).toBe(true);
    expect(kept(s)).toBe(1);
  });
});
