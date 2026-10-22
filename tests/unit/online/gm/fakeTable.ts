import { crc32, deflateSync } from 'node:zlib';
import { KEEPALIVE_PING } from '../../../../src/app/online/protocol/index.ts';
import type { App, WorkspaceLeaf } from 'obsidian';
import type { SceneState, SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import type { Presented, TabSource } from '../../../../src/app/online/gm/presentedScene.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';

/*
 * An Obsidian with Atlas map tabs, the scene Atlas presents and a relay socket, for tests of the running
 * table (`OnlineControl`, `OnlineTable`). Each test file mocks `obsidian` itself.
 */

/** A socket that records what the companion sends and lets a test play the relay. */
export class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.OPEN;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, ((event: { data?: unknown; code?: number }) => void)[]>();

  constructor(readonly url: string) {
    FakeSocket.all.push(this);
    queueMicrotask(() => this.emit('open', {}));
  }

  addEventListener(type: string, listener: (event: { data?: unknown; code?: number }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  send(text: string): void {
    this.sent.push(text);
  }

  close(): void {
    this.readyState = 3;
  }

  relay(frame: object): void {
    this.emit('message', { data: JSON.stringify({ v: 1, ...frame }) });
  }

  /** The relay closes the socket. */
  closeWith(code: number): void {
    this.readyState = 3;
    this.emit('close', { code });
  }

  frames(): { readonly t: string; readonly to?: string; readonly secret?: string; readonly body?: { readonly t: string; readonly scene?: unknown; readonly tokens?: readonly unknown[] } }[] {
    return this.sent.filter((text) => text !== KEEPALIVE_PING).map((text) => JSON.parse(text) as ReturnType<FakeSocket['frames']>[number]);
  }

  bodies(): NonNullable<ReturnType<FakeSocket['frames']>[number]['body']>[] {
    return this.frames().flatMap((frame) => (frame.t === 'send' && frame.body !== undefined ? [frame.body] : []));
  }

  private emit(type: string, event: { data?: unknown; code?: number }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

export function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8);
  const rows = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 128)])));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

/** A view's scene tabs as Atlas's tab store keeps them, one per map file, ids made from the file. */
export class FakeTabs implements TabSource {
  private state: ReturnType<TabSource['getState']>;
  private readonly listeners = new Set<() => void>();

  constructor(mapPath: string | null) {
    this.state = { tabs: [], activeTabId: null };
    if (mapPath !== null) this.activate(mapPath);
  }

  static idOf(mapPath: string): string {
    return `tab:${mapPath}`;
  }

  getState(): ReturnType<TabSource['getState']> {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Makes the tab of `mapPath` the active one, opening it first when the view has none. */
  activate(mapPath: string): void {
    const id = FakeTabs.idOf(mapPath);
    const tabs = this.state.tabs.some((tab) => tab.id === id) ? this.state.tabs : [...this.state.tabs, { id, filePath: mapPath, displayName: mapPath.split('/').pop()?.replace('.atlasmap', '') ?? mapPath, isLoaded: true, isDirty: false }];
    this.state = { tabs, activeTabId: id };
    for (const listener of [...this.listeners]) listener();
  }
}

/** An Atlas view as the companion reads it: its type, store, scene tabs, renderer, and the flag it sets while it closes. */
export class FakeView {
  isViewClosing = false;
  readonly containerEl = { ownerDocument: {} };
  readonly serviceManager = { getRendererService: () => ({ getRenderer: () => this.renderer }), getAssetService: () => workspace.assets };
  readonly tabMetaStore: FakeTabs;
  constructor(readonly atlasStore: SceneStore, public renderer: object | null) {
    this.tabMetaStore = new FakeTabs(atlasStore.getState().mapPath);
  }
  getViewType(): string {
    return 'atlas-vtt';
  }
}

export interface FakeTab {
  readonly leaf: WorkspaceLeaf;
  readonly view: FakeView;
  readonly store: SceneStore & { set(next: SceneState): void };
}

/** An Atlas map tab showing `state`, with a renderer whose players' frame sees every token not hidden. */
export function atlasTab(state: SceneState): FakeTab {
  let current = state;
  const listeners = new Set<(next: SceneState) => void>();
  const store = {
    getState: () => current,
    setState: () => undefined,
    subscribe: (listener: (next: SceneState) => void) => (listeners.add(listener), () => void listeners.delete(listener)),
    set: (next: SceneState) => {
      current = next;
      for (const listener of listeners) listener(next);
    },
  };
  const view = new FakeView(store, fakeTokenSource(() => current, () => undefined, () => 70));
  return { leaf: { view } as unknown as WorkspaceLeaf, view, store };
}

/** Atlas opens another scene in a tab's view as it does: the tab first, then the store loads the scene. */
export function switchScene(tab: FakeTab, next: SceneState): void {
  if (next.mapPath !== null) tab.view.tabMetaStore.activate(next.mapPath);
  tab.store.set({ ...tab.store.getState(), isMapLoading: true });
  tab.store.set(next);
}

/**
 * The open Atlas leaves, the scene Atlas presents (null: none), the vault's files, who told Atlas they show its
 * presented scene, and Atlas's asset service as far as a test gives it one (where a map's collection is looked up).
 */
export const workspace = {
  leaves: [] as WorkspaceLeaf[],
  presented: null as Presented | null,
  files: new Map<string, Uint8Array>(),
  shownElsewhere: 0,
  assets: null as object | null,
};

const workspaceListeners = new Map<string, Set<(...args: unknown[]) => void>>();

/** Triggers a workspace event, as Atlas does when a collection's settings change. */
export function trigger(name: string, ...args: unknown[]): void {
  for (const listener of [...(workspaceListeners.get(name) ?? [])]) listener(...args);
}

const presentedListeners = new Set<(scene: Presented | null) => void>();

/** Atlas's presented scene as its plugin offers it (`presentedScene`): read-only, with change listeners. */
const atlasPresented = {
  get: (): Presented | null => workspace.presented,
  onChange: (listener: (scene: Presented | null) => void): (() => void) => {
    presentedListeners.add(listener);
    return () => presentedListeners.delete(listener);
  },
  showElsewhere: (): (() => void) => {
    workspace.shownElsewhere += 1;
    let stopped = false;
    return () => {
      if (!stopped) workspace.shownElsewhere -= 1;
      stopped = true;
    };
  },
};

/** Atlas presents a tab's active scene, as the eye on its scene tab does, and tells who listens. */
export function present(tab: FakeTab): void {
  const { mapPath } = tab.store.getState();
  workspace.presented = mapPath === null ? null : { tabId: FakeTabs.idOf(mapPath), filePath: mapPath };
  presentedListeners.forEach((listener) => listener(workspace.presented));
}

/** The device's local storage of the fake app. */
export const localStorage = new Map<string, unknown>();

export const app = {
  loadLocalStorage: (key: string): unknown => localStorage.get(key) ?? null,
  saveLocalStorage: (key: string, value: unknown): void => void localStorage.set(key, value),
  workspace: {
    getLeavesOfType: (type: string) => workspace.leaves.filter((leaf) => (leaf.view as unknown as FakeView).getViewType() === type),
    getMostRecentLeaf: () => workspace.leaves[0] ?? null,
    setActiveLeaf: () => undefined,
    on: (name: string, listener: (...args: unknown[]) => void) => {
      workspaceListeners.set(name, (workspaceListeners.get(name) ?? new Set()).add(listener));
      return { name, listener };
    },
    offref: (ref: { name: string; listener: (...args: unknown[]) => void }) => void workspaceListeners.get(ref.name)?.delete(ref.listener),
  },
  vault: {
    getFileByPath: (path: string) => {
      const bytes = workspace.files.get(path);
      return bytes === undefined ? null : { path, stat: { mtime: 0, size: bytes.length } };
    },
    readBinary: (file: { path: string }) => Promise.resolve(workspace.files.get(file.path)?.slice().buffer),
  },
  plugins: { plugins: { 'atlas-vtt': { presentedScene: atlasPresented } } },
} as unknown as App;
