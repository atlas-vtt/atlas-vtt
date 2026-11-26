/**
 * A surface as it stands open: each part is measured in turn, and may first open what it names (a menu, a popover).
 * A part that floats over the surface is measured on its own: it covers what lies under it on purpose.
 */
export interface OpenedSurface {
  parts: Record<string, () => Promise<Element | readonly Element[]>>;
  close: () => void | Promise<void>;
}

export interface ScreenSurface {
  name: string;
  open: (window: { width: number; height: number }) => Promise<OpenedSurface>;
}

export const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Clicks the first element of `selector` whose text is `text`. */
export function clickText(selector: string, text: string): void {
  const element = [...document.querySelectorAll<HTMLElement>(selector)].find((candidate) => candidate.textContent?.trim() === text);
  if (!element) throw new Error(`No ${selector} reading "${text}"`);
  element.click();
}

/** Every element of `selector` now in the page. */
export const all = (selector: string): Element[] => [...document.querySelectorAll(selector)];

/** `root` where it shows `selector`, else nothing, which the test reports as a surface that did not open. */
export const showing = (root: Element, selector: string): Element[] => (root.querySelector(selector) ? [root] : []);
