/** Obsidian's key scope: handlers by modifiers and key; the most recently pushed scope is asked first. */
export class Scope {
  keys: Array<{ modifiers: string[]; key: string; func: (event: KeyboardEvent) => unknown }> = [];
  constructor(public parent?: Scope) {}
  register(modifiers: string[], key: string, func: (event: KeyboardEvent) => unknown) {
    const handler = { modifiers, key, func };
    this.keys.push(handler);
    return handler;
  }
  unregister(handler: unknown): void {
    this.keys = this.keys.filter((candidate) => candidate !== handler);
  }
}

export class App {
  vault: any;
  workspace: any;
  fileManager: any;
  metadataCache: any;
  scope = new Scope();
  /** Scopes pushed and not yet popped, most recent last. */
  keymap = {
    scopes: [] as Scope[],
    pushScope(scope: Scope): void { this.scopes.push(scope); },
    popScope(scope: Scope): void { this.scopes = this.scopes.filter((candidate) => candidate !== scope); },
  };
  constructor() {}
}

export class Plugin {}

export class WorkspaceLeaf {
  view: any;
  app: any;
  constructor() {
    this.view = null;
    this.app = null;
  }
}

export class View {
  leaf: WorkspaceLeaf;
  app: any;
  containerEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = (leaf as any)?.app ?? (leaf as any)?.view?.app ?? {};
    this.containerEl = document.createElement('div');
  }
}

export class ItemView extends View {
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = document.createElement('div');
  }
}

export class FileView extends ItemView {
  file: TFile | null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.file = null;
  }
}

/**
 * A markdown note view with the state pinned previews save: mode, ephemeral
 * state (cursor) and scroll. Like Obsidian, it only takes a scroll over once mounted.
 */
export class MarkdownView extends FileView {
  private mode: 'source' | 'preview' = 'source';
  /** Reading view; kept in the view's DOM in both modes, as Obsidian does. */
  previewMode = { containerEl: this.containerEl.createDiv({ cls: 'markdown-reading-view' }) };
  private eState: Record<string, unknown> = {};
  private scrollLine = 0;
  currentMode = {
    getScroll: (): number => this.scrollLine,
    applyScroll: (scroll: number): void => {
      this.scrollLine = scroll;
    },
  };

  getMode(): 'source' | 'preview' {
    return this.mode;
  }

  setMode(mode: 'source' | 'preview'): void {
    this.mode = mode;
  }

  getEphemeralState(): Record<string, unknown> {
    return { ...this.eState };
  }

  setEphemeralState(state: Record<string, unknown>): void {
    const rest = { ...state };
    delete rest.scroll;
    this.eState = rest;
  }
}

export class TAbstractFile {
  path: string;
  name: string;
  parent: TFolder | null;

  constructor(path = '') {
    this.path = path;
    this.name = path.split('/').pop() || '';
    this.parent = null;
  }
}

export class TFile extends TAbstractFile {
  extension: string;
  basename: string;
  stat = { ctime: 0, mtime: 0, size: 0 };

  constructor(path = '') {
    super(path);
    const parts = this.name.split('.');
    this.extension = parts.length > 1 ? parts[parts.length - 1] || '' : '';
    this.basename = parts.length > 1 ? parts.slice(0, -1).join('.') : this.name;
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[];

  constructor(path = '') {
    super(path);
    this.children = [];
  }
}

export class Notice {
  // Keep a signature close to Obsidian's constructor.
  constructor(_message: string, _timeout?: number) {}
  hide(): void {}
}

export interface RequestUrlParam {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function requestUrl(_params: RequestUrlParam): Promise<any> {
  throw new Error('requestUrl not mocked in tests');
}

interface CachedHeading {
  heading: string;
  position: { start: { line: number } };
}

/**
 * Resolves a `#heading` subpath against the cached headings as Obsidian does:
 * every `#` starts a nested heading, so `#Keep#Cellar` is the Cellar after Keep
 * and a heading containing `#` itself is never found this way.
 */
export function resolveSubpath(cache: { headings?: CachedHeading[] }, subpath: string): { start: { line: number } } | null {
  const headings = cache.headings ?? [];
  let index = -1;
  for (const part of subpath.split('#').filter(Boolean)) {
    index = headings.findIndex((h, i) => i > index && h.heading === part);
    if (index === -1) return null;
  }
  return index === -1 ? null : { start: headings[index].position.start };
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
}

export class Component {
  private cleanups: Array<() => void> = [];
  load(): void {}
  onload(): void {}
  unload(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
  }
  onunload(): void {}
  register(cb: () => void): void {
    this.cleanups.push(cb);
  }
  addChild<T>(child: T): T {
    return child;
  }
}

/** Obsidian's Bases view; tests fill `data`, `config` and `allProperties` themselves. */
export abstract class BasesView extends Component {
  abstract type: string;
  data: { data: unknown[] } = { data: [] };
  allProperties: string[] = [];
  config = {
    getOrder: (): string[] => [],
    getDisplayName: (id: string): string => id,
  };
  constructor(public controller: unknown) {
    super();
  }
  abstract onDataUpdated(): void;
}

export class MarkdownRenderChild extends Component {
  constructor(public containerEl: HTMLElement) {
    super();
  }
}

export const MarkdownRenderer = {
  /** Renders the source as plain text — enough for asserting on content. */
  render(_app: unknown, markdown: string, el: HTMLElement): Promise<void> {
    const p = el.ownerDocument.createElement('p');
    p.textContent = markdown;
    el.appendChild(p);
    return Promise.resolve();
  },
};

// Obsidian's YAML helpers are `yaml` under the hood, which is already a
// transitive dependency, so the mock can parse for real.
import { parse as parseYamlImpl, stringify as stringifyYamlImpl } from 'yaml';

export function parseYaml(source: string): unknown {
  return parseYamlImpl(source);
}

export function stringifyYaml(value: unknown): string {
  return stringifyYamlImpl(value);
}

export abstract class AbstractInputSuggest<T> {
  limit = 100;
  constructor(public app: unknown, protected textInputEl: HTMLInputElement | HTMLDivElement) {}
  setValue(value: string): void {
    if (this.textInputEl instanceof HTMLInputElement) this.textInputEl.value = value;
    else this.textInputEl.textContent = value;
  }
  getValue(): string {
    return this.textInputEl instanceof HTMLInputElement ? this.textInputEl.value : this.textInputEl.textContent ?? '';
  }
  close(): void {}
  protected abstract getSuggestions(query: string): T[] | Promise<T[]>;
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  abstract selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void;
}

export class Modal {
  app: unknown;
  contentEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;

  constructor(app?: unknown) {
    this.app = app;
    this.contentEl = document.createElement('div');
    this.modalEl = document.createElement('div');
    this.titleEl = document.createElement('div');
  }

  setTitle(title: string): this { this.titleEl.textContent = title; return this; }
  open(): void {}
  close(): void {}
  onOpen(): void {}
  onClose(): void {}
}

export const Platform = {
  isMacOS: false,
  isWin: false,
  isLinux: false,
  isDesktop: true,
  isMobile: false,
};

export const apiVersion = '1.13.1';

export function requireApiVersion(version: string): boolean {
  const have = apiVersion.split('.').map(Number);
  const want = version.split('.').map(Number);
  for (let i = 0; i < want.length; i++) {
    const diff = (have[i] ?? 0) - (want[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return true;
}

/** The subset of Obsidian's `Setting` components the tests drive, on real DOM elements. Grow it per test need. */
abstract class ValueComponent<T> {
  protected changed: ((value: T) => void) | undefined;
  onChange(callback: (value: T) => void): this {
    this.changed = callback;
    return this;
  }
  setDisabled(_disabled: boolean): this { return this; }
}

class InputBacked<E extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> extends ValueComponent<string> {
  constructor(public inputEl: E) {
    super();
    inputEl.addEventListener('input', () => this.changed?.(inputEl.value));
    inputEl.addEventListener('change', () => this.changed?.(inputEl.value));
  }
  setValue(value: string): this { this.inputEl.value = value; return this; }
  setPlaceholder(text: string): this { this.inputEl.setAttribute('placeholder', text); return this; }
}

export class TextComponent extends InputBacked<HTMLInputElement> {}
export class TextAreaComponent extends InputBacked<HTMLTextAreaElement> {}

export class DropdownComponent extends InputBacked<HTMLSelectElement> {
  addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      const option = this.inputEl.ownerDocument.createElement('option');
      option.value = value;
      option.textContent = display;
      this.inputEl.appendChild(option);
    }
    return this;
  }
}

export class ToggleComponent extends ValueComponent<boolean> {
  private value = false;
  constructor(public toggleEl: HTMLElement) { super(); }
  setValue(value: boolean): this {
    if (this.value !== value) { this.value = value; this.changed?.(value); }
    this.toggleEl.classList.toggle('is-enabled', value);
    return this;
  }
}

export class ButtonComponent {
  constructor(public buttonEl: HTMLButtonElement) {}
  setButtonText(text: string): this { this.buttonEl.textContent = text; return this; }
  setCta(): this { this.buttonEl.classList.add('mod-cta'); return this; }
  setDisabled(disabled: boolean): this { this.buttonEl.disabled = disabled; return this; }
  onClick(callback: () => unknown): this { this.buttonEl.addEventListener('click', () => void callback()); return this; }
}

export class ExtraButtonComponent {
  constructor(public extraSettingsEl: HTMLElement) {}
  setIcon(_icon: string): this { return this; }
  setTooltip(tooltip: string): this { this.extraSettingsEl.setAttribute('aria-label', tooltip); return this; }
  onClick(callback: () => unknown): this { this.extraSettingsEl.addEventListener('click', () => void callback()); return this; }
}

export class Setting {
  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    const doc = containerEl.ownerDocument;
    this.settingEl = doc.createElement('div');
    this.settingEl.className = 'setting-item';
    const info = doc.createElement('div');
    info.className = 'setting-item-info';
    this.nameEl = doc.createElement('div');
    this.nameEl.className = 'setting-item-name';
    this.descEl = doc.createElement('div');
    this.descEl.className = 'setting-item-description';
    info.append(this.nameEl, this.descEl);
    this.controlEl = doc.createElement('div');
    this.controlEl.className = 'setting-item-control';
    this.settingEl.append(info, this.controlEl);
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string): this { this.nameEl.textContent = name; return this; }
  setDesc(desc: string): this { this.descEl.textContent = desc; return this; }
  setClass(cls: string): this { this.settingEl.classList.add(cls); return this; }

  private create<T extends HTMLElement>(tag: string): T {
    const el = this.settingEl.ownerDocument.createElement(tag) as T;
    this.controlEl.appendChild(el);
    return el;
  }

  addText(callback: (component: TextComponent) => void): this { callback(new TextComponent(this.create('input'))); return this; }
  addTextArea(callback: (component: TextAreaComponent) => void): this { callback(new TextAreaComponent(this.create('textarea'))); return this; }
  addDropdown(callback: (component: DropdownComponent) => void): this { callback(new DropdownComponent(this.create('select'))); return this; }
  addToggle(callback: (component: ToggleComponent) => void): this { callback(new ToggleComponent(this.create('div'))); return this; }
  addButton(callback: (component: ButtonComponent) => void): this { callback(new ButtonComponent(this.create('button'))); return this; }
  addExtraButton(callback: (component: ExtraButtonComponent) => void): this { callback(new ExtraButtonComponent(this.create('div'))); return this; }
}

export function setIcon(_parent: HTMLElement, _iconId: string): void {}

/** Case-insensitive subsequence match; Obsidian's real scoring is richer. */
export function prepareFuzzySearch(query: string): (text: string) => { score: number; matches: [number, number][] } | null {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  return (text: string) => {
    const haystack = text.toLowerCase();
    const matches: [number, number][] = [];
    let from = 0;
    for (const char of needle) {
      const index = haystack.indexOf(char, from);
      if (index === -1) return null;
      const last = matches[matches.length - 1];
      if (last && last[1] === index) last[1] = index + 1;
      else matches.push([index, index + 1]);
      from = index + 1;
    }
    return { score: -matches.length - (matches[0]?.[0] ?? 0) / 100, matches };
  };
}
