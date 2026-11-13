// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FogStrokeKeys } from '../../src/app/pixi/fog/FogStrokeKeys';

/** The keys of a stroke on a canvas in this window, and a listener where the map's shortcuts listen. */
function strokeKeys(): { keys: FogStrokeKeys; flipped: ReturnType<typeof vi.fn>; dropped: ReturnType<typeof vi.fn>; shortcuts: ReturnType<typeof vi.fn>; stop: () => void } {
  const canvas = document.body.createEl('canvas');
  const flipped = vi.fn();
  const dropped = vi.fn();
  const shortcuts = vi.fn();
  window.addEventListener('keydown', shortcuts);
  const keys = new FogStrokeKeys(() => canvas, { flipped, dropped });
  return { keys, flipped, dropped, shortcuts, stop: () => window.removeEventListener('keydown', shortcuts) };
}

const key = (type: 'keydown' | 'keyup', name: string, target: EventTarget = document.body): KeyboardEvent => {
  const event = new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => { document.body.empty(); });

describe('the keys of a fog stroke under way', () => {
  it('drops the stroke on Escape, which never reaches the map\'s shortcuts', () => {
    const { keys, dropped, shortcuts, stop } = strokeKeys();
    keys.hold();
    const escape = key('keydown', 'Escape');
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(escape.defaultPrevented).toBe(true);
    expect(shortcuts).not.toHaveBeenCalled();
    // Any other key is the map's as ever.
    key('keydown', 'f');
    expect(shortcuts).toHaveBeenCalledTimes(1);
    expect(dropped).toHaveBeenCalledTimes(1);
    keys.release();
    stop();
  });

  it('tells Alt going down and up', () => {
    const { keys, flipped, stop } = strokeKeys();
    keys.hold();
    key('keydown', 'Alt');
    expect(flipped).toHaveBeenLastCalledWith(true);
    key('keyup', 'Alt');
    expect(flipped).toHaveBeenLastCalledWith(false);
    expect(flipped).toHaveBeenCalledTimes(2);
    keys.release();
    stop();
  });

  it('hears nothing before a stroke and after it', () => {
    const { keys, flipped, dropped, shortcuts, stop } = strokeKeys();
    key('keydown', 'Escape');
    keys.hold();
    keys.release();
    key('keydown', 'Escape');
    key('keydown', 'Alt');
    window.dispatchEvent(new Event('blur'));
    expect(dropped).not.toHaveBeenCalled();
    expect(flipped).not.toHaveBeenCalled();
    // Escape is the map's again.
    expect(shortcuts).toHaveBeenCalledTimes(3);
    stop();
  });

  it('listens once however often it is held, and leaves a key typed into a field to the field', () => {
    const { keys, dropped, shortcuts, stop } = strokeKeys();
    keys.hold();
    keys.hold();
    key('keydown', 'Escape');
    expect(dropped).toHaveBeenCalledTimes(1);
    const field = document.body.createEl('input');
    key('keydown', 'Escape', field);
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(shortcuts).toHaveBeenCalledTimes(1);
    keys.release();
    stop();
  });

  it('hands Enter and Backspace to what is under way, and keeps them from the map\'s shortcuts only where it took them', () => {
    const canvas = document.body.createEl('canvas');
    const edited = vi.fn((name: string) => name === 'Enter');
    const shortcuts = vi.fn();
    window.addEventListener('keydown', shortcuts);
    const keys = new FogStrokeKeys(() => canvas, { flipped: vi.fn(), dropped: vi.fn(), edited });
    keys.hold();
    expect(key('keydown', 'Enter').defaultPrevented).toBe(true);
    expect(edited).toHaveBeenLastCalledWith('Enter', false);
    expect(shortcuts).not.toHaveBeenCalled();
    // Not taken: the key is the map's, as every other key.
    expect(key('keydown', 'Backspace').defaultPrevented).toBe(false);
    expect(edited).toHaveBeenLastCalledWith('Backspace', false);
    expect(shortcuts).toHaveBeenCalledTimes(1);
    // A key held down says that it repeats.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true, bubbles: true, cancelable: true }));
    expect(edited).toHaveBeenLastCalledWith('Enter', true);
    keys.release();
    key('keydown', 'Enter');
    expect(edited).toHaveBeenCalledTimes(3);
    window.removeEventListener('keydown', shortcuts);
  });

  it('hands the map\'s undo key to what is under way as it hands Backspace, and leaves it to the map where it is not taken', () => {
    const canvas = document.body.createEl('canvas');
    let taken = true;
    const edited = vi.fn(() => taken);
    const shortcuts = vi.fn();
    window.addEventListener('keydown', shortcuts);
    const keys = new FogStrokeKeys(() => canvas, { flipped: vi.fn(), dropped: vi.fn(), edited, undoes: (event) => event.key === 'z' && event.ctrlKey });
    const press = (init: KeyboardEventInit): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      document.body.dispatchEvent(event);
      return event;
    };
    keys.hold();
    expect(press({ key: 'z', ctrlKey: true }).defaultPrevented).toBe(true);
    expect(edited).toHaveBeenLastCalledWith('Backspace', false);
    expect(shortcuts).not.toHaveBeenCalled();
    press({ key: 'z', ctrlKey: true, repeat: true });
    expect(edited).toHaveBeenLastCalledWith('Backspace', true);
    // A plain z is no undo, and nothing of the stroke's.
    press({ key: 'z' });
    expect(edited).toHaveBeenCalledTimes(2);
    expect(shortcuts).toHaveBeenCalledTimes(1);
    // A drag has no use for it: the map undoes.
    taken = false;
    expect(press({ key: 'z', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(shortcuts).toHaveBeenCalledTimes(2);
    keys.release();
    window.removeEventListener('keydown', shortcuts);
  });

  it('tells Shift, Ctrl and Cmd going down and up, with the keys held then', () => {
    const canvas = document.body.createEl('canvas');
    const rekeyed = vi.fn();
    const keys = new FogStrokeKeys(() => canvas, { flipped: vi.fn(), dropped: vi.fn(), rekeyed });
    const press = (type: 'keydown' | 'keyup', name: string, init: KeyboardEventInit): void => {
      document.body.dispatchEvent(new KeyboardEvent(type, { key: name, bubbles: true, cancelable: true, ...init }));
    };
    keys.hold();
    press('keydown', 'Shift', { shiftKey: true });
    expect(rekeyed).toHaveBeenLastCalledWith({ shift: true, free: false });
    press('keydown', 'Control', { shiftKey: true, ctrlKey: true });
    expect(rekeyed).toHaveBeenLastCalledWith({ shift: true, free: true });
    press('keyup', 'Shift', { ctrlKey: true });
    expect(rekeyed).toHaveBeenLastCalledWith({ shift: false, free: true });
    press('keyup', 'Control', {});
    expect(rekeyed).toHaveBeenLastCalledWith({ shift: false, free: false });
    press('keydown', 'Meta', { metaKey: true });
    expect(rekeyed).toHaveBeenLastCalledWith({ shift: false, free: true });
    expect(rekeyed).toHaveBeenCalledTimes(5);
    keys.release();
  });

  it('drops what is under way for a key that is not the map\'s, and leaves that key alone', () => {
    const canvas = document.body.createEl('canvas');
    const dropped = vi.fn();
    const edited = vi.fn(() => true);
    const shortcuts = vi.fn();
    window.addEventListener('keydown', shortcuts);
    const keys = new FogStrokeKeys(() => canvas, { flipped: vi.fn(), dropped, edited, areMaps: () => false });
    keys.hold();
    expect(key('keydown', 'Enter').defaultPrevented).toBe(false);
    expect(dropped).toHaveBeenCalledTimes(1);
    expect(edited).not.toHaveBeenCalled();
    expect(shortcuts).toHaveBeenCalledTimes(1);
    keys.release();
    window.removeEventListener('keydown', shortcuts);
  });

  it('drops the stroke when the window loses focus, since no key up or release may follow', () => {
    const { keys, dropped, stop } = strokeKeys();
    keys.hold();
    window.dispatchEvent(new Event('blur'));
    expect(dropped).toHaveBeenCalledTimes(1);
    keys.release();
    stop();
  });
});
