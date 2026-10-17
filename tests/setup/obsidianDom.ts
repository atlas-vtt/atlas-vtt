/**
 * Obsidian extends the DOM prototypes with element helpers (`createEl`,
 * `createDiv`, `empty`, ...). jsdom has none of them, so this setup file
 * installs the subset the plugin relies on.
 */

interface ElementOptions {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  href?: string;
}

// jsdom's Blob/File lack the byte reader supported by Obsidian's Chromium.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

type ElementSpec = ElementOptions | string | undefined;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * Applies the options HTML and SVG elements share: classes, text and attributes.
 * Obsidian sets an HTML element's `className` but adds an SVG element's string
 * `cls` as one class token, which throws when it holds a space.
 */
function applyCommonOptions(el: Element, options: ElementOptions): void {
  if (Array.isArray(options.cls)) el.classList.add(...options.cls);
  else if (options.cls && el instanceof SVGElement) el.classList.add(options.cls);
  else if (options.cls) el.classList.add(...options.cls.split(' ').filter(Boolean));
  if (options.text !== undefined) el.textContent = options.text;
  for (const [name, value] of Object.entries(options.attr ?? {})) {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, String(value));
  }
}

function applyOptions(el: HTMLElement, spec: ElementSpec): void {
  const options: ElementOptions = typeof spec === 'string' ? { cls: spec } : spec ?? {};
  applyCommonOptions(el, options);
  if (options.title !== undefined) el.title = options.title;
  const input = el as HTMLInputElement;
  if (options.type !== undefined) input.type = options.type;
  if (options.value !== undefined) input.value = options.value;
  if (options.placeholder !== undefined) input.placeholder = options.placeholder;
  if (options.href !== undefined) (el as HTMLAnchorElement).href = options.href;
}

function createChild(parent: Node, tag: string, spec: ElementSpec, callback?: (el: HTMLElement) => void): HTMLElement {
  const el = (parent.ownerDocument ?? document).createElement(tag);
  applyOptions(el, spec);
  parent.appendChild(el);
  callback?.(el);
  return el;
}

const helpers: Record<string, (this: HTMLElement, ...args: never[]) => unknown> = {
  createEl(this: HTMLElement, tag: string, spec?: ElementSpec, callback?: (el: HTMLElement) => void) {
    return createChild(this, tag, spec, callback);
  },
  createDiv(this: HTMLElement, spec?: ElementSpec, callback?: (el: HTMLElement) => void) {
    return createChild(this, 'div', spec, callback);
  },
  createSpan(this: HTMLElement, spec?: ElementSpec, callback?: (el: HTMLElement) => void) {
    return createChild(this, 'span', spec, callback);
  },
  createSvg(this: HTMLElement, tag: string, spec?: ElementSpec, callback?: (el: SVGElement) => void) {
    const el = (this.ownerDocument ?? document).createElementNS(SVG_NAMESPACE, tag) as SVGElement;
    applyCommonOptions(el, typeof spec === 'string' ? { cls: spec } : spec ?? {});
    this.appendChild(el);
    callback?.(el);
    return el;
  },
  empty(this: HTMLElement) {
    this.replaceChildren();
  },
  setText(this: HTMLElement, text: string) {
    this.textContent = text;
  },
  appendText(this: HTMLElement, text: string) {
    this.appendChild((this.ownerDocument ?? document).createTextNode(text));
  },
  addClass(this: HTMLElement, ...classes: string[]) {
    this.classList.add(...classes);
  },
  removeClass(this: HTMLElement, ...classes: string[]) {
    this.classList.remove(...classes);
  },
  toggleClass(this: HTMLElement, cls: string, value: boolean) {
    this.classList.toggle(cls, value);
  },
  hasClass(this: HTMLElement, cls: string) {
    return this.classList.contains(cls);
  },
  instanceOf(this: HTMLElement, type: new () => unknown) {
    return this instanceof type;
  },
  hide(this: HTMLElement) {
    this.style.display = 'none';
  },
  show(this: HTMLElement) {
    this.style.removeProperty('display');
  },
};

function createDetached(tag: string, spec: ElementSpec): HTMLElement {
  const el = document.createElement(tag);
  applyOptions(el, spec);
  return el;
}

const globalHelpers: Record<string, (...args: never[]) => unknown> = {
  createEl: (tag: string, spec?: ElementSpec) => createDetached(tag, spec),
  createDiv: (spec?: ElementSpec) => createDetached('div', spec),
  createSpan: (spec?: ElementSpec) => createDetached('span', spec),
  createFragment: () => document.createDocumentFragment(),
};

if (typeof document !== 'undefined') {
  const scope = globalThis as unknown as Record<string, unknown>;
  for (const [name, helper] of Object.entries(globalHelpers)) {
    if (!(name in scope)) scope[name] = helper;
  }
  // Obsidian points these at the focused window; jsdom has only one.
  if (!('activeWindow' in scope)) scope.activeWindow = window;
  if (!('activeDocument' in scope)) scope.activeDocument = document;
}

if (typeof Element !== 'undefined') {
  const prototype = Element.prototype as unknown as Record<string, unknown>;
  for (const [name, helper] of Object.entries(helpers)) {
    if (!(name in prototype)) prototype[name] = helper;
  }
}

// Obsidian's `node.win` / `node.doc` point at the window and document a node lives in (popouts included).
if (typeof Node !== 'undefined' && !('win' in Node.prototype)) {
  Object.defineProperties(Node.prototype, {
    doc: { get(this: Node) { return this.ownerDocument ?? document; } },
    win: { get(this: Node) { return this.ownerDocument?.defaultView ?? window; } },
  });
}

// jsdom implements neither the Web Animations API nor media queries; Electron has both.
if (typeof Element !== 'undefined' && typeof Element.prototype.animate !== 'function') {
  const prototype = Element.prototype as unknown as Record<string, unknown>;
  prototype.animate = (): Partial<Animation> => ({
    cancel: () => undefined, finish: () => undefined, pause: () => undefined, play: () => undefined,
    onfinish: null, finished: Promise.resolve() as Promise<Animation>,
  });
}
// jsdom never decodes images
if (typeof HTMLImageElement !== 'undefined' && typeof HTMLImageElement.prototype.decode !== 'function') {
  HTMLImageElement.prototype.decode = (): Promise<void> => Promise.resolve();
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const scope = window as unknown as Record<string, unknown>;
  scope.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}
// jsdom has no layout, so nothing ever resizes
if (typeof window !== 'undefined' && typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Obsidian's Chromium has Element.checkVisibility; jsdom lays nothing out, so every element counts as visible.
if (typeof Element !== 'undefined' && !('checkVisibility' in Element.prototype)) {
  Object.defineProperty(Element.prototype, 'checkVisibility', { value: () => true, configurable: true, writable: true });
}
