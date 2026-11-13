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

  it('drops the stroke when the window loses focus, since no key up or release may follow', () => {
    const { keys, dropped, stop } = strokeKeys();
    keys.hold();
    window.dispatchEvent(new Event('blur'));
    expect(dropped).toHaveBeenCalledTimes(1);
    keys.release();
    stop();
  });
});
