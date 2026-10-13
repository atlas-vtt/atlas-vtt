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

export class Keymap {
  /** The pane an event asks for: Ctrl (Cmd on macOS) or a middle click a tab, with Alt a split, with Alt and Shift a window. */
  static isModEvent(event?: MouseEvent | KeyboardEvent | null): 'tab' | 'split' | 'window' | boolean {
    if (!event) return false;
    const mod = Platform.isMacOS ? event.metaKey : event.ctrlKey;
    if (mod && event.altKey) return event.shiftKey ? 'window' : 'split';
    if (mod || (event instanceof MouseEvent && event.button === 1)) return 'tab';
    return false;
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
  /** Obsidian's device-local storage of the vault, kept in memory. */
  localStorage = new Map<string, unknown>();
  constructor() {}
  loadLocalStorage(key: string): unknown {
    return this.localStorage.get(key) ?? null;
  }
  saveLocalStorage(key: string, data: unknown): void {
    if (data === null) this.localStorage.delete(key);
    else this.localStorage.set(key, data);
  }
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
  scope: Scope | null = null;
  navigation = false;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = (leaf as any)?.app ?? (leaf as any)?.view?.app ?? {};
    this.containerEl = document.createElement('div');
  }

  getState(): Record<string, unknown> {
    return {};
  }

  async setState(_state: unknown, _result: unknown): Promise<void> {}

  setEphemeralState(_state: unknown): void {}
}

export class ItemView extends View {
  contentEl: HTMLElement;
  /** The header's action buttons, as `addAction` makes them. */
  actionsEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.actionsEl = this.containerEl.createDiv({ cls: 'view-actions' });
    this.contentEl = document.createElement('div');
  }

  addAction(icon: string, title: string, callback: (evt: MouseEvent) => unknown): HTMLElement {
    const el = this.actionsEl.createEl('button', { cls: 'clickable-icon view-action', attr: { 'aria-label': title, 'data-icon': icon } });
    el.addEventListener('click', (event) => callback(event));
    return el;
  }
}

export class FileView extends ItemView {
  file: TFile | null;
  allowNoFile = false;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.file = null;
  }

  /** As Obsidian's: the file it shows. */
  getState(): Record<string, unknown> {
    return this.file ? { file: this.file.path } : {};
  }

  /** As Obsidian's: a state naming another file loads it, unloading the one shown. */
  async setState(state: unknown, _result: unknown): Promise<void> {
    const path = (state as { file?: unknown } | null)?.file;
    if (typeof path !== 'string' || path === this.file?.path) return;
    const file = this.app?.vault?.getAbstractFileByPath?.(path);
    if (!(file instanceof TFile)) return;
    if (this.file) await this.onUnloadFile(this.file);
    this.file = file;
    await this.onLoadFile(file);
  }

  async onLoadFile(_file: TFile): Promise<void> {}

  async onUnloadFile(_file: TFile): Promise<void> {}
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
  constructor(_message: string | DocumentFragment, _timeout?: number) {}
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

export function getLanguage(): string {
  return 'en';
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
  registerDomEvent<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, callback: (event: HTMLElementEventMap[K]) => unknown): void {
    el.addEventListener(type, callback);
    this.register(() => el.removeEventListener(type, callback));
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

/** Obsidian's editor suggester; Obsidian sets `context` when one of its suggestions is chosen. */
export abstract class EditorSuggest<T> {
  context: { editor: unknown; file: unknown; start: unknown; end: unknown; query: string } | null = null;
  /** Never read: present so a subclass's item type is used. */
  protected readonly item?: T;
  constructor(public app: any) {}
}

/** Obsidian's prompt of suggestions: a modal with a search field; the tests choose items directly. */
export class SuggestModal<T> extends Modal {
  emptyStateText = '';
  inputEl: HTMLInputElement = document.createElement('input');
  /** Never read: present so a subclass's item type is used. */
  protected readonly item?: T;
  setPlaceholder(placeholder: string): void { this.inputEl.placeholder = placeholder; }
}

export interface FuzzyMatch<T> {
  item: T;
  match: { score: number; matches: Array<[number, number]> };
}

export class FuzzySuggestModal<T> extends SuggestModal<FuzzyMatch<T>> {}

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

export function displayTooltip(_target: HTMLElement, _content: string | DocumentFragment): void {}

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

/** Obsidian's menu: the items it was given, and where it was shown; the last one shown is `Menu.shown`. */
export class MenuItem {
  title = '';
  icon: string | null = null;
  handler: ((event: MouseEvent | KeyboardEvent) => unknown) | null = null;
  setTitle(title: string): this { this.title = title; return this; }
  setIcon(icon: string | null): this { this.icon = icon; return this; }
  setSection(_section: string): this { return this; }
  onClick(handler: (event: MouseEvent | KeyboardEvent) => unknown): this { this.handler = handler; return this; }
}

export class Menu {
  static shown: Menu | null = null;
  items: MenuItem[] = [];
  position: { x: number; y: number } | null = null;
  addItem(build: (item: MenuItem) => unknown): this {
    const item = new MenuItem();
    build(item);
    this.items.push(item);
    return this;
  }
  addSeparator(): this { return this; }
  showAtPosition(position: { x: number; y: number }): this {
    this.position = position;
    Menu.shown = this;
    return this;
  }
  showAtMouseEvent(event: MouseEvent): this {
    return this.showAtPosition({ x: event.clientX, y: event.clientY });
  }
}
