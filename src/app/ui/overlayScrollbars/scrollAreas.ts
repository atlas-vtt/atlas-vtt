/**
 * Which elements are Atlas' scroll areas, the ones whose native scrollbar `styles/_overlay-scrollbars.scss` hides
 * and `OverlayScrollbars` replaces: an element carrying an `atlas-` class, of a tag that can hold a shadow root
 * (the overlay is drawn there, so the area's own children stay as they are). Keep this list and the stylesheet's
 * selector alike, or an area loses its scrollbar without getting the overlay.
 */
export const SCROLLBAR_HOST_TAGS: ReadonlySet<string> = new Set([
  'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'NAV', 'MAIN', 'HEADER', 'FOOTER', 'SPAN', 'P', 'BLOCKQUOTE',
]);

export interface ScrollAxes {
  y: boolean;
  x: boolean;
}

/** `node` as an Atlas scroll host when it is one by tag and class, else null; works for nodes of popout windows. */
export function atlasScrollHost(node: EventTarget | null): HTMLElement | null {
  const element = node as Element | null;
  if (element?.nodeType !== 1 || !SCROLLBAR_HOST_TAGS.has(element.tagName)) return null;
  const classes = element.getAttribute('class');
  if (classes === null || !(classes.startsWith('atlas-') || classes.includes(' atlas-'))) return null;
  return element as HTMLElement;
}

/** The axes `style` lets the user scroll (overflow `auto` or `scroll`). */
export function scrollAxes(style: CSSStyleDeclaration): ScrollAxes {
  const scrolls = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';
  return { y: scrolls(style.overflowY), x: scrolls(style.overflowX) };
}

/** Whether an area scrolls with no scrollbar at all (`atlas-scrollbar-none`, a non-inherited property). */
export function scrollsBare(style: CSSStyleDeclaration): boolean {
  return style.getPropertyValue('--atlas-scrollbar').trim() === 'none';
}

/**
 * Whether the area is the containing block of its own absolutely positioned descendants. The overlay is one, so
 * it then lies in the scrolled content and has to be moved back by what the area scrolled; otherwise it is
 * anchored to the area from outside and never moves.
 */
export function containsItsPositioned(style: CSSStyleDeclaration): boolean {
  // A property the engine does not know reads as undefined (jsdom), one at its initial value as `none` / `normal`.
  const value = (name: string): string => style.getPropertyValue(name);
  const set = (name: string): boolean => !['', 'none', 'static', 'normal', 'visible'].includes(value(name));
  return set('position')
    || ['transform', 'translate', 'rotate', 'scale', 'perspective', 'filter', 'backdrop-filter', 'content-visibility'].some(set)
    || /layout|paint|strict|content/.test(value('contain'))
    || /size/.test(value('container-type'))
    || /transform|perspective|filter|position/.test(value('will-change'));
}
