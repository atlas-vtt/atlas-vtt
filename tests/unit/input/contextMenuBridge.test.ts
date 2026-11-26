// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenuBridge } from '../../../src/app/input/contextMenuBridge';
import { LONG_PRESS_MS } from '../../../src/app/input/longPress';
import { pressBecameDrag } from '../../../src/app/input/pressBecameDrag';
import { FakeClock } from './fakeGestureClock';

type PointerInit = { pointerId?: number; pointerType?: string; clientX?: number; clientY?: number; isPrimary?: boolean };

/** jsdom has no PointerEvent: a mouse event that carries what a pointer event adds. */
function pointer(target: Element, type: string, init: PointerInit = {}): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: init.clientX ?? 50, clientY: init.clientY ?? 60 });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId ?? 1 });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'touch' });
  // The first finger of a touch, as the browser says of every finger that lands while no other is down
  Object.defineProperty(event, 'isPrimary', { value: init.isPrimary ?? true });
  target.dispatchEvent(event);
}

function page(): { clock: FakeClock; card: HTMLElement; menus: MouseEvent[]; clicks: number[] } {
  const clock = new FakeClock();
  const bridge = new ContextMenuBridge(document, clock);
  cleanups.push(() => bridge.destroy());
  const root = document.body.appendChild(document.createElement('div'));
  root.className = 'atlas-vtt-plugin';
  cleanups.push(() => root.remove());
  const card = root.appendChild(document.createElement('div'));
  const menus: MouseEvent[] = [];
  const clicks: number[] = [];
  root.addEventListener('contextmenu', (event) => menus.push(event));
  root.addEventListener('click', () => clicks.push(clock.now()));
  return { clock, card, menus, clicks };
}

const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

describe('a finger resting on something Atlas draws', () => {
  it('sends it the contextmenu event of a right-click, at the finger, after the long press', () => {
    const { clock, card, menus } = page();
    pointer(card, 'pointerdown', { clientX: 120, clientY: 80 });
    clock.advance(LONG_PRESS_MS - 1);
    expect(menus).toHaveLength(0);
    clock.advance(1);
    expect(menus).toHaveLength(1);
    expect(menus[0]!.target).toBe(card);
    expect([menus[0]!.clientX, menus[0]!.clientY, menus[0]!.button]).toEqual([120, 80, 2]);
  });

  it('swallows the click that follows the release, and only that one', () => {
    const { clock, card, clicks } = page();
    pointer(card, 'pointerdown');
    clock.advance(LONG_PRESS_MS);
    pointer(card, 'pointerup');
    card.click();
    expect(clicks).toHaveLength(0);
    card.click();
    expect(clicks).toHaveLength(1);
  });

  it('is a tap when lifted before the time is up: no menu, and its click goes through', () => {
    const { clock, card, menus, clicks } = page();
    pointer(card, 'pointerdown');
    clock.advance(200);
    pointer(card, 'pointerup');
    card.click();
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
    expect(clicks).toHaveLength(1);
  });

  it('is a drag once it moved 8 px', () => {
    const { clock, card, menus } = page();
    pointer(card, 'pointerdown', { clientX: 50, clientY: 60 });
    pointer(card, 'pointermove', { clientX: 50, clientY: 70 });
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
  });

  it('ends when the list under the finger scrolls', () => {
    const { clock, card, menus } = page();
    pointer(card, 'pointerdown');
    card.parentElement!.dispatchEvent(new Event('scroll'));
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
  });

  it('ends when a second finger comes down', () => {
    const { clock, card, menus } = page();
    pointer(card, 'pointerdown', { pointerId: 1 });
    pointer(card, 'pointerdown', { pointerId: 2, isPrimary: false });
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
  });

  it('swallows the web view\'s own contextmenu for the touch, so one menu opens with one timing', () => {
    const { clock, card, menus } = page();
    pointer(card, 'pointerdown');
    clock.advance(LONG_PRESS_MS);
    const native = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.dispatchEvent(native);
    expect(menus).toHaveLength(1);
    expect(native.defaultPrevented).toBe(true);
  });

  it('does not select the text under it', () => {
    const { card } = page();
    pointer(card, 'pointerdown');
    const select = new Event('selectstart', { bubbles: true, cancelable: true });
    card.dispatchEvent(select);
    expect(select.defaultPrevented).toBe(true);
  });
});

describe('what the bridge leaves alone', () => {
  it('a mouse: its press starts nothing and its right-click is its own', () => {
    const { clock, card, menus } = page();
    pointer(card, 'pointerdown', { pointerType: 'mouse' });
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
    const rightClick = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.dispatchEvent(rightClick);
    expect(menus).toHaveLength(1);
    expect(rightClick.defaultPrevented).toBe(false);
  });

  it('a mouse after a finger whose release was lost: its right-click is still its own', () => {
    const { card, menus } = page();
    pointer(card, 'pointerdown', { pointerId: 9 });
    pointer(card, 'pointerdown', { pointerType: 'mouse', pointerId: 1 });
    const rightClick = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.dispatchEvent(rightClick);
    expect(rightClick.defaultPrevented).toBe(false);
    expect(menus).toHaveLength(1);
  });

  it.each(['input', 'textarea'])('a finger on an %s, where a long press selects text', (tag) => {
    const { clock, card, menus } = page();
    const field = card.appendChild(document.createElement(tag));
    pointer(field, 'pointerdown');
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
    const native = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    field.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(false);
  });

  it('the Markdown editor and text being edited, also inside an Atlas window', () => {
    const { clock, card, menus } = page();
    const editor = card.appendChild(document.createElement('div'));
    editor.className = 'cm-editor';
    const editable = card.appendChild(document.createElement('div'));
    editable.setAttribute('contenteditable', 'true');
    pointer(editor.appendChild(document.createElement('span')), 'pointerdown');
    clock.advance(LONG_PRESS_MS);
    pointer(editable, 'pointerdown', { pointerId: 2 });
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
  });

  it('the map\'s canvas, which has its own gestures', () => {
    const { clock, card, menus } = page();
    pointer(card.appendChild(document.createElement('canvas')), 'pointerdown');
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
  });

  it('everything that is not Atlas\', also while Atlas marks the body', () => {
    const { clock, menus } = page();
    document.body.classList.add('atlas-no-select');
    cleanups.push(() => document.body.classList.remove('atlas-no-select'));
    const other = document.body.appendChild(document.createElement('div'));
    cleanups.push(() => other.remove());
    const heard = vi.fn();
    other.addEventListener('contextmenu', heard);
    pointer(other, 'pointerdown');
    clock.advance(LONG_PRESS_MS);
    expect(heard).not.toHaveBeenCalled();
    expect(menus).toHaveLength(0);
  });

  it('what Atlas portals to the body is its own: a menu, a dialog', () => {
    const { clock } = page();
    const menu = document.body.appendChild(document.createElement('div'));
    menu.className = 'atlas-ctx-menu';
    cleanups.push(() => menu.remove());
    const heard = vi.fn();
    menu.addEventListener('contextmenu', heard);
    pointer(menu, 'pointerdown');
    clock.advance(LONG_PRESS_MS);
    expect(heard).toHaveBeenCalledOnce();
  });
});

describe('a finger that rests on something it then drags', () => {
  it('opens no menu once the press has become a drag, though it rests on past the long press', () => {
    const { clock, card, menus, clicks } = page();
    pointer(card, 'pointerdown');
    // The tile lifts after a quarter of a second; the long press is due at 400 ms.
    clock.advance(250);
    pressBecameDrag();
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
    // Nothing fired, so the click after the release is not swallowed either.
    pointer(card, 'pointerup');
    card.click();
    expect(clicks).toHaveLength(1);
  });

  it('is a long press again with the next press, and hears no drag once it is gone', () => {
    const clock = new FakeClock();
    const bridge = new ContextMenuBridge(document, clock);
    const root = document.body.appendChild(document.createElement('div'));
    root.className = 'atlas-vtt-plugin';
    cleanups.push(() => root.remove());
    const menus: MouseEvent[] = [];
    root.addEventListener('contextmenu', (event) => menus.push(event));
    pointer(root, 'pointerdown');
    pressBecameDrag();
    pointer(root, 'pointerup');
    pointer(root, 'pointerdown', { pointerId: 2 });
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(1);
    bridge.destroy();
    expect(() => pressBecameDrag()).not.toThrow();
  });
});

describe('a drag that keeps the release of its finger to itself', () => {
  /** What the toolbar editor and the glass do while they drag: the release is theirs, taken on the window before the page hears it. */
  function keepReleases(): void {
    const keep = (event: Event): void => event.stopPropagation();
    window.addEventListener('pointerup', keep, true);
    window.addEventListener('pointercancel', keep, true);
    cleanups.push(() => {
      window.removeEventListener('pointerup', keep, true);
      window.removeEventListener('pointercancel', keep, true);
    });
  }

  it('leaves no finger behind: the next finger that rests still opens its menu', () => {
    const { clock, card, menus } = page();
    keepReleases();
    pointer(card, 'pointerdown', { pointerId: 1 });
    clock.advance(100);
    pointer(card, 'pointerup', { pointerId: 1 });
    pointer(card, 'pointerdown', { pointerId: 2 });
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(1);
  });

  it('ends the press with the release all the same: a tap there opens nothing later', () => {
    const { clock, card, menus } = page();
    keepReleases();
    pointer(card, 'pointerdown');
    clock.advance(100);
    pointer(card, 'pointerup');
    clock.advance(LONG_PRESS_MS);
    expect(menus).toHaveLength(0);
  });

  it('leaves the menu key and the mouse their contextmenu afterwards', () => {
    const { card, menus } = page();
    keepReleases();
    pointer(card, 'pointerdown');
    pointer(card, 'pointerup');
    const byKey = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.dispatchEvent(byKey);
    expect(byKey.defaultPrevented).toBe(false);
    expect(menus).toHaveLength(1);
  });
});

describe('a contextmenu no finger made', () => {
  it('passes while a finger is down, where the browser says a mouse made it', () => {
    const { card, menus } = page();
    pointer(card, 'pointerdown');
    const byMouse = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(byMouse, 'pointerType', { value: 'mouse' });
    card.dispatchEvent(byMouse);
    expect(byMouse.defaultPrevented).toBe(false);
    expect(menus).toHaveLength(1);
  });

  it('passes once the finger has lifted', () => {
    const { card, menus } = page();
    pointer(card, 'pointerdown');
    pointer(card, 'pointerup');
    const byKey = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    card.dispatchEvent(byKey);
    expect(byKey.defaultPrevented).toBe(false);
    expect(menus).toHaveLength(1);
  });

  it('is still swallowed where the browser says a finger made it, down or not', () => {
    const { card, menus } = page();
    const byTouch = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(byTouch, 'pointerType', { value: 'touch' });
    card.dispatchEvent(byTouch);
    expect(byTouch.defaultPrevented).toBe(true);
    expect(menus).toHaveLength(0);
  });
});
