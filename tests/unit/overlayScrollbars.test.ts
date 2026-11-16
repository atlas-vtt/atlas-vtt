// @vitest-environment jsdom
import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDE_AFTER_MS } from '../../src/app/ui/overlayScrollbars/OverlayScrollbar';
import { OverlayScrollbars } from '../../src/app/ui/overlayScrollbars/OverlayScrollbars';
import { atlasScrollHost, containsItsPositioned } from '../../src/app/ui/overlayScrollbars/scrollAreas';
import { thumbGeometry } from '../../src/app/ui/overlayScrollbars/thumbGeometry';

describe('thumbGeometry', () => {
  it('has no thumb while the content fits', () => {
    expect(thumbGeometry(300, 300, 290)).toBeNull();
  });

  it('sizes the thumb by the share of the content in view, and its travel by the rest of the track', () => {
    expect(thumbGeometry(1000, 250, 400)).toEqual({ size: 100, travel: 300 });
  });

  it('keeps a long list grabbable', () => {
    expect(thumbGeometry(100_000, 250, 400)).toEqual({ size: 24, travel: 376 });
  });
});

describe('atlasScrollHost', () => {
  it.each([
    ['div', 'atlas-list', true],
    ['section', 'pane atlas-list', true],
    ['div', 'language-atlas-statblock', false],
    ['div', 'cm-scroller', false],
    ['textarea', 'atlas-input', false],
    ['ul', 'atlas-list', false],
  ])('<%s class="%s"> is a host: %s', (tag, cls, host) => {
    const element = document.createElement(tag);
    element.className = cls;
    expect(atlasScrollHost(element) === element).toBe(host);
  });

  it('tells an area that contains its positioned content from one that does not', () => {
    const element = document.createElement('div');
    document.body.append(element);
    expect(containsItsPositioned(getComputedStyle(element))).toBe(false);
    element.style.position = 'relative';
    expect(containsItsPositioned(getComputedStyle(element))).toBe(true);
    element.remove();
  });
});

describe('OverlayScrollbars', () => {
  let scrollbars: OverlayScrollbars;

  /** An area of 200 px showing 1000 px of content. */
  function area(cls = 'atlas-list', style: Record<string, string> = { 'overflow-y': 'auto' }): HTMLElement {
    const element = document.body.createDiv({ cls });
    element.setCssProps(style);
    element.createDiv({ text: 'row' });
    Object.defineProperties(element, {
      scrollHeight: { configurable: true, get: () => 1000 },
      clientHeight: { configurable: true, get: () => 200 },
      scrollWidth: { configurable: true, get: () => 300 },
      clientWidth: { configurable: true, get: () => 300 },
    });
    return element;
  }

  const frame = (element: HTMLElement): Element | null | undefined => element.shadowRoot?.querySelector('[part~="frame"]');
  const parts = (element: HTMLElement): string => frame(element)?.getAttribute('part') ?? '';

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    scrollbars = new OverlayScrollbars(document);
  });

  afterEach(() => {
    scrollbars.destroy();
    document.body.empty();
    vi.useRealTimers();
  });

  it('draws the scrollbar of an area that scrolls, shows it and fades it a second later', () => {
    const element = area();
    element.dispatchEvent(new Event('scroll'));
    expect(element.hasAttribute('data-atlas-scrollbar')).toBe(true);
    // The area's own children stay as they are; they render through the shadow root's slot.
    expect(element.children).toHaveLength(1);
    expect(element.shadowRoot?.querySelector('slot')).not.toBeNull();
    vi.advanceTimersToNextFrame();
    expect(parts(element)).toBe('frame shown');
    const thumb = element.shadowRoot!.querySelector<HTMLElement>('[part~="thumb-y"]')!;
    expect(thumb.hidden).toBe(false);
    expect(frame(element)!.getAttribute('style')).toContain('--atlas-scrollbar-thumb-y: 40px');
    expect(element.shadowRoot!.querySelector<HTMLElement>('[part~="thumb-x"]')!.hidden).toBe(true);
    vi.advanceTimersByTime(HIDE_AFTER_MS);
    expect(parts(element)).toBe('frame');
  });

  it('shows the scrollbar when the pointer enters the area, not for a touch', () => {
    const element = area();
    const child = element.firstElementChild!;
    child.dispatchEvent(Object.assign(new MouseEvent('pointerover', { bubbles: true, composed: true }), { pointerType: 'touch' }));
    expect(element.shadowRoot).toBeNull();
    child.dispatchEvent(Object.assign(new MouseEvent('pointerover', { bubbles: true, composed: true }), { pointerType: 'mouse' }));
    vi.advanceTimersToNextFrame();
    expect(parts(element)).toBe('frame shown');
  });

  it('marks the frame of a positioned area, which moves it back by what the area scrolled', () => {
    const element = area('atlas-list', { 'overflow-y': 'auto', position: 'relative' });
    element.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    expect(parts(element)).toBe('frame contained shown');
  });

  it('leaves alone what is not an Atlas scroll area, and an area that scrolls bare', () => {
    const plain = area('cm-scroller');
    const hidden = area('atlas-list', { 'overflow-y': 'hidden' });
    const bare = area('atlas-list', { 'overflow-y': 'auto', '--atlas-scrollbar': 'none' });
    for (const element of [plain, hidden, bare]) element.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    for (const element of [plain, hidden, bare]) expect(element.shadowRoot).toBeNull();
  });

  it('shows nothing for an area whose content fits', () => {
    const element = area();
    Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => 200 });
    element.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    expect(parts(element)).toBe('frame');
  });

  it('takes its scrollbars away when it is destroyed', () => {
    const element = area();
    element.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    scrollbars.destroy();
    expect(element.hasAttribute('data-atlas-scrollbar')).toBe(false);
    expect(frame(element)).toBeNull();
    // A new start (Atlas reloaded) finds the shadow root it made before.
    scrollbars = new OverlayScrollbars(document);
    element.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    expect(parts(element)).toBe('frame shown');
  });
});
