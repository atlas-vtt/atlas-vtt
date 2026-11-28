import { crc32, deflateSync } from 'node:zlib';
import type { App, WorkspaceLeaf } from 'obsidian';
import type { CollectionLookup } from '../../../../src/app/gameSystems/mapRules';
import type { ObservedStore, SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { MapCanvas, MapServices, MapStore, MapView } from '../../../../src/app/online/gm/mapView.ts';
import type { TabSource } from '../../../../src/app/online/gm/presentedScene.ts';
import { presentedSceneOf, type PresentedScene } from '../../../../src/app/services/presentedScene';
import type { HostAccount } from '../../../../src/app/online/gm/tableStart.ts';
import { fakeTokenSource } from './fakeTokenSource.ts';

/*
 * An Obsidian with Atlas map tabs and the scene Atlas presents, for tests of the running table
 * (`OnlineControl`, `OnlineTable`), whose relay is `FakeRelay`. Each test file mocks `obsidian` itself.
 */

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

/**
 * An Atlas map view (`MapView`): its type, store, scene tabs, canvas and services, and the flag it sets while it
 * closes. Its tools and bus are a test's to give (`serviceManager`); without them the table rolls no dice.
 */
export class FakeView implements MapView {
  isViewClosing = false;
  readonly app = app;
  viewId = 'fake-view';
  readonly containerEl = { ownerDocument: {} };
  readonly serviceManager: MapServices = {
    getAssetService: () => workspace.assets,
    getToolController: () => null,
    getEventBus: () => {
      throw new Error('This view has no event bus.');
    },
  };
  readonly tabMetaStore: FakeTabs;
  readonly atlasStore: MapStore;
  constructor(store: ObservedStore, public renderer: MapCanvas | null) {
    // The scenes of these tests have no levels to switch: nothing calls the store's level switch.
    this.atlasStore = store as MapStore;
    this.tabMetaStore = new FakeTabs(store.getState().mapPath);
  }
  getViewType(): string {
    return 'atlas-vtt';
  }
  isClosing(): boolean {
    return this.isViewClosing;
  }
  switchToTab(tabId: string): Promise<void> {
    const tab = this.tabMetaStore.getState().tabs.find((entry) => entry.id === tabId);
    if (tab !== undefined) this.tabMetaStore.activate(tab.filePath);
    return Promise.resolve();
  }
}

export interface FakeTab {
  readonly leaf: WorkspaceLeaf;
  readonly view: FakeView;
  readonly store: ObservedStore & { set(next: SceneState): void };
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
  /** Atlas's presented scene (`presentedSceneOf`): set, Atlas presents it and tells who listens. */
  get presented(): PresentedScene | null {
    return presentedSceneOf(app).get();
  },
  set presented(scene: PresentedScene | null) {
    presentedSceneOf(app).set(scene);
  },
  files: new Map<string, Uint8Array>(),
  /** Whether anyone tells Atlas now that players see its presented scene elsewhere: 1 while one does, else 0. */
  get shownElsewhere(): number {
    return presentedSceneOf(app).isShownElsewhere() ? 1 : 0;
  },
  assets: null as CollectionLookup | null,
};

const workspaceListeners = new Map<string, Set<(...args: unknown[]) => void>>();

/** Triggers a workspace event, as Atlas does when a collection's settings change. */
export function trigger(name: string, ...args: unknown[]): void {
  for (const listener of [...(workspaceListeners.get(name) ?? [])]) listener(...args);
}

/** Atlas presents a tab's active scene, as the eye on its scene tab does, and tells who listens. */
export function present(tab: FakeTab): void {
  const { mapPath } = tab.store.getState();
  workspace.presented = mapPath === null ? null : { tabId: FakeTabs.idOf(mapPath), filePath: mapPath };
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
  // The vault and the metadata cache tell of no change in these tests.
  metadataCache: { on: () => ({}), offref: () => undefined },
  vault: {
    on: () => ({}),
    offref: () => undefined,
    getFileByPath: (path: string) => {
      const bytes = workspace.files.get(path);
      return bytes === undefined ? null : { path, stat: { mtime: 0, size: bytes.length } };
    },
    readBinary: (file: { path: string }) => Promise.resolve(workspace.files.get(file.path)?.slice().buffer),
  },
} as unknown as App;

/** A signed-in account whose tables keep assets in the store: the salt is known, so every reference carries its id (`storedRef`). */
export function storedAccount(): HostAccount {
  const salt = Uint8Array.from({ length: 32 }, (_, n) => n);
  return {
    token: () => 'account-token',
    signedOutByServer: () => undefined,
    refresh: () => Promise.resolve(),
    assets: { salt: { soon: () => Promise.resolve(salt), ensure: () => Promise.resolve(salt) }, settled: () => undefined },
  };
}
