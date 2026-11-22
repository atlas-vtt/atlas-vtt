// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { visibleViewport } from '../../../src/app/host/visibleViewport';
import { createDeviceProfile, type PointerSource } from '../../../src/app/platform/deviceProfile';
import { KEYBOARD_INSET_PROPERTY, keyboardInset, registerKeyboardViewport, watchKeyboard } from '../../../src/app/platform/keyboardViewport';
import { focusedAtlasInput, revealDistance, revealInput } from '../../../src/app/platform/revealFocusedInput';

const WIDTH = 1180;
const HEIGHT = 820;
const KEYBOARD = 440;

/** The window's visual viewport as a tablet reports it: the test raises and lowers the keyboard. */
class FakeVisualViewport extends EventTarget {
  offsetLeft = 0;
  offsetTop = 0;
  width = WIDTH;
  height = HEIGHT;

  keyboard(up: boolean): void {
    this.height = up ? HEIGHT - KEYBOARD : HEIGHT;
    this.dispatchEvent(new Event('resize'));
  }
}

/**
 * A dialog body 300 px high at `top` that scrolls 900 px of fields, with one input 30 px high
 * `offset` px down its content. Its rectangle follows the body's scroll position, as in a browser.
 */
function scrollingField(top: number, offset: number): { body: HTMLElement; input: HTMLInputElement } {
  const body = document.body.createDiv({ cls: 'atlas-dialog-body' });
  body.style.overflowY = 'auto';
  Object.defineProperty(body, 'clientHeight', { value: 300 });
  Object.defineProperty(body, 'scrollHeight', { value: 900 });
  body.getBoundingClientRect = () => ({ left: 0, right: 400, top, bottom: top + 300, width: 400, height: 300, x: 0, y: top, toJSON: () => ({}) });
  const input = body.createEl('input', { type: 'text' });
  input.getBoundingClientRect = () => {
    const y = top + offset - body.scrollTop;
    return { left: 0, right: 200, top: y, bottom: y + 30, width: 200, height: 30, x: 0, y, toJSON: () => ({}) };
  };
  return { body, input };
}

let visual: FakeVisualViewport;

beforeEach(() => {
  visual = new FakeVisualViewport();
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: HEIGHT });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((run) => {
    run(0);
    return 1;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.empty();
  Reflect.deleteProperty(window, 'visualViewport');
});

describe('keyboardInset', () => {
  it('is what the visual viewport leaves out at the bottom of the page', () => {
    expect(keyboardInset(820, { offsetTop: 0, height: 380 })).toBe(440);
    expect(keyboardInset(820, { offsetTop: 100, height: 380 })).toBe(340);
  });

  it('is nothing where the web view itself was resized for the keyboard', () => {
    expect(keyboardInset(380, { offsetTop: 0, height: 380 })).toBe(0);
    expect(keyboardInset(380, { offsetTop: 0, height: 380.4 })).toBe(0);
  });
});

describe('revealDistance', () => {
  const seen = { top: 0, bottom: 380 };

  it('leaves a field alone that stands in sight', () => {
    expect(revealDistance({ top: 100, bottom: 130 }, seen, 12)).toBe(0);
  });

  it('scrolls a field under the keyboard up until it clears it by the margin', () => {
    expect(revealDistance({ top: 500, bottom: 530 }, seen, 12)).toBe(162);
  });

  it('scrolls a field above the top back down', () => {
    expect(revealDistance({ top: -40, bottom: -10 }, seen, 12)).toBe(-52);
  });

  it('keeps the top of a field taller than the room in sight', () => {
    expect(revealDistance({ top: 100, bottom: 700 }, seen, 12)).toBe(88);
  });
});

describe('focusedAtlasInput', () => {
  it('is the text field of an Atlas surface that has the focus', () => {
    const { input } = scrollingField(0, 0);
    input.focus();
    expect(focusedAtlasInput(document)).toBe(input);
  });

  it('is none for a switch, for a field outside Atlas and for Obsidian\'s editor', () => {
    const surface = document.body.createDiv({ cls: 'atlas-panel' });
    const box = surface.createEl('input', { type: 'checkbox' });
    box.focus();
    expect(focusedAtlasInput(document)).toBeNull();

    const foreign = document.body.createDiv({ cls: 'modal' }).createEl('input', { type: 'text' });
    foreign.focus();
    expect(focusedAtlasInput(document)).toBeNull();

    const editor = surface.createDiv({ cls: 'cm-editor' }).createDiv({ attr: { contenteditable: 'true', tabindex: '0' } });
    editor.focus();
    expect(focusedAtlasInput(document)).toBeNull();
  });
});

describe('revealInput', () => {
  it('scrolls the field\'s scroller, which scrollIntoView would leave alone', () => {
    const { body, input } = scrollingField(200, 250);
    // In its scroller's own box (200..500), but under a keyboard whose top edge is at 380
    revealInput(input, { top: 0, bottom: 380 }, 12);
    expect(body.scrollTop).toBe(112);
    expect(input.getBoundingClientRect().bottom).toBe(368);
  });

  it('brings a field out from under its scroller\'s own edge, though the keyboard leaves it in the window', () => {
    // The body shows 100..400 of the window; the field stands at 420..450, clipped below it
    const { body, input } = scrollingField(100, 320);
    revealInput(input, { top: 0, bottom: 600 }, 12);
    expect(body.scrollTop).toBe(62);
    expect(input.getBoundingClientRect().bottom).toBe(388);
  });
});

describe('watchKeyboard', () => {
  it('keeps the keyboard\'s inset on the body and takes it away again', () => {
    const stop = watchKeyboard(document);
    expect(document.body.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('');
    visual.keyboard(true);
    expect(document.body.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe(`${KEYBOARD}px`);
    visual.keyboard(false);
    expect(document.body.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('');
    visual.keyboard(true);
    stop();
    expect(document.body.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('');
  });

  it('scrolls nothing while the window counts as seen whole', () => {
    const { body, input } = scrollingField(200, 250);
    input.focus();
    const stop = watchKeyboard(document);
    visual.keyboard(true);
    expect(body.scrollTop).toBe(0);
    stop();
  });

  it('does nothing in a window without a visual viewport', () => {
    Reflect.deleteProperty(window, 'visualViewport');
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    expect(() => watchKeyboard(document)()).not.toThrow();
  });
});

describe('registerKeyboardViewport', () => {
  const pointers: PointerSource = { coarse: () => true, mouse: () => false, onChange: () => () => undefined };

  function fakePlugin(): { plugin: Plugin; unload(): void } {
    const cleanups: (() => void)[] = [];
    const plugin = {
      app: { workspace: { iterateAllLeaves: () => undefined, on: () => ({}), offref: () => undefined } },
      registerEvent: () => undefined,
      register: (cleanup: () => void) => { cleanups.push(cleanup); },
    };
    return { plugin: plugin as unknown as Plugin, unload: () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup()) };
  }

  it('on a tablet: the focused field of a dialog is scrolled above the keyboard, inside the visible area', () => {
    const { plugin, unload } = fakePlugin();
    registerKeyboardViewport(plugin, createDeviceProfile({ isMobile: true, isPhone: false }, pointers));
    const { body, input } = scrollingField(200, 250);
    input.focus();

    visual.keyboard(true);

    const seen = visibleViewport(window);
    expect(seen.bottom).toBe(HEIGHT - KEYBOARD);
    expect(body.scrollTop).toBe(112);
    expect(input.getBoundingClientRect().bottom).toBeLessThanOrEqual(seen.bottom);
    expect(input.getBoundingClientRect().top).toBeGreaterThanOrEqual(seen.top);

    unload();
    expect(visibleViewport(window).bottom).toBe(window.innerHeight);
    expect(document.body.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('');
  });

  it('on desktop: nothing follows the visual viewport', () => {
    const { plugin, unload } = fakePlugin();
    registerKeyboardViewport(plugin, createDeviceProfile({ isMobile: false, isPhone: false }, pointers));
    const { body, input } = scrollingField(200, 250);
    input.focus();

    visual.keyboard(true);

    expect(visibleViewport(window).bottom).toBe(window.innerHeight);
    expect(body.scrollTop).toBe(0);
    expect(document.body.style.getPropertyValue(KEYBOARD_INSET_PROPERTY)).toBe('');
    unload();
  });
});
