/**
 * The remote view tests' workspace: `getLeaf('tab')` gives a fake leaf whose `setViewState`
 * makes a real `RemoteMapView` (over `fakeAtlasView.ts`, which the test file mocks
 * `atlas-view` with) and opens it; `detach` closes it. The last view opened is the active one.
 * Import only from a test file that mocks `../../src/app/atlas-view` with `./fakeAtlasView`.
 */
import type { App, WorkspaceLeaf } from 'obsidian';
import { AtlasApiHost } from '../../src/api/AtlasApiHost';
import { ATLAS_VIEW_HOOKS } from '../../src/api/atlasViewHooks';
import { LANDED_CAPABILITIES } from '../../src/api/capabilities';
import { DisposerSet } from '../../src/api/disposers';
import { ApiEvents } from '../../src/api/events';
import { buildExtension } from '../../src/api/extension';
import { lasersApi } from '../../src/api/lasers';
import { remoteViewsApi } from '../../src/api/remoteViews';
import { viewsApi } from '../../src/api/views';
import { ViewTracker } from '../../src/api/viewTracker';
import type { LasersApi } from '../../src/api/types/lasers';
import type { RemoteViewsApi } from '../../src/api/types/remoteViews';
import type { ViewsApi } from '../../src/api/types/views';
import { RemoteMapView } from '../../src/app/remote-view/RemoteMapView';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakePlugin, fakeServices, type FakePlugin } from './apiFakes';

export interface FakeLeaf {
  app: App;
  view: unknown;
  type: string | null;
  setViewState(state: { type: string }): Promise<void>;
  getViewState(): { type: string | null };
  detach(): void;
}

/** How the fake workspace opens the next remote view: as Obsidian does, closed before it opens, making no view, or refusing. */
export type LeafMode = 'open' | 'close-before-open' | 'no-view' | 'reject';

export interface RemoteWorkspace {
  leaves: FakeLeaf[];
  leavesOf(type: string): FakeLeaf[];
  revealed: FakeLeaf[];
  /** How the next `setViewState` behaves; back to 'open' after it. */
  next: { mode: LeafMode };
  /** A remote view nothing opened, as Obsidian restores or duplicates one: a leaf no owner was bound to. */
  restore(): Promise<FakeLeaf>;
}

/** An in-memory vault app whose workspace makes and closes remote views. */
export function remoteApp(): { app: App; workspace: RemoteWorkspace; files: Map<string, string> } {
  const { app, files } = createInMemoryApp();
  const leaves: FakeLeaf[] = [];
  const revealed: FakeLeaf[] = [];
  let active: unknown = null;
  const next = { mode: 'open' as LeafMode };
  const makeLeaf = (): FakeLeaf => {
    const leaf: FakeLeaf = {
      app, view: null, type: null,
      setViewState: async ({ type }): Promise<void> => {
        const mode = next.mode;
        next.mode = 'open';
        if (mode === 'reject') throw new Error('the workspace refused');
        if (mode === 'no-view') return;
        leaf.type = type;
        const view = new RemoteMapView(leaf as unknown as WorkspaceLeaf);
        leaf.view = view;
        leaves.push(leaf);
        active = view;
        if (mode === 'close-before-open') {
          leaf.detach();
          return;
        }
        await view.onOpen();
      },
      getViewState: () => ({ type: leaf.type }),
      detach: (): void => {
        const index = leaves.indexOf(leaf);
        if (index >= 0) leaves.splice(index, 1);
        if (active === leaf.view) active = null;
        void (leaf.view as RemoteMapView | null)?.onClose();
      },
    };
    return leaf;
  };
  const workspace = {
    getLeaf: (): FakeLeaf => makeLeaf(),
    getLeavesOfType: (type: string): FakeLeaf[] => leaves.filter((leaf) => leaf.type === type),
    getActiveViewOfType: (): unknown => active,
    revealLeaf: async (leaf: FakeLeaf): Promise<void> => { revealed.push(leaf); },
    onLayoutReady: (callback: () => void): void => callback(),
    on: (): object => ({}),
    offref: (): void => undefined,
    trigger: (): void => undefined,
  };
  (app as unknown as { workspace: unknown }).workspace = workspace;
  const restore = async (): Promise<FakeLeaf> => {
    const leaf = makeLeaf();
    await leaf.setViewState({ type: 'atlas-vtt-remote' });
    return leaf;
  };
  return { app, files, workspace: { leaves, leavesOf: workspace.getLeavesOfType, revealed, next, restore } };
}

export interface RemoteHarness {
  app: App;
  api: RemoteViewsApi;
  views: ViewsApi;
  lasers: LasersApi;
  tracker: ViewTracker;
  workspace: RemoteWorkspace;
  files: Map<string, string>;
  /** Disposes the extension's registrations, as unloading it does. */
  dispose(): void;
}

/** One extension's remote views over a started tracker, with `views` and `lasers` of the same extension. */
export async function remoteHarness(): Promise<RemoteHarness> {
  const { app, workspace, files } = remoteApp();
  const events = new ApiEvents();
  const tracker = new ViewTracker(app, events, ATLAS_VIEW_HOOKS);
  tracker.start();
  const disposers = new DisposerSet();
  return {
    app, workspace, files, tracker,
    api: remoteViewsApi(app, { id: 'ext', disposers }, tracker),
    views: viewsApi(tracker, disposers),
    lasers: lasersApi(tracker, disposers),
    dispose: () => disposers.disposeAll(),
  };
}

/** The published API with every landed capability, over the remote view workspace, and one extension plugin. */
export async function remoteHostHarness(): Promise<{ host: AtlasApiHost; plugin: FakePlugin; workspace: RemoteWorkspace }> {
  const { app, workspace } = remoteApp();
  const events = new ApiEvents();
  const tracker = new ViewTracker(app, events, ATLAS_VIEW_HOOKS);
  tracker.start();
  const services = { ...fakeServices(app), views: tracker };
  const host = new AtlasApiHost({ app, capabilities: LANDED_CAPABILITIES, build: (scope) => buildExtension(scope, services) });
  return { host, plugin: fakePlugin('ext'), workspace };
}
