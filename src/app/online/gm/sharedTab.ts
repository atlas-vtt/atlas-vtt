import type { WorkspaceLeaf } from 'obsidian';
import { rendererOf, sceneStoreOf, type SceneStore } from './atlasView.ts';
import { findPresentedTab, showsPresented, type Presented, type PresentedTab } from './presentedScene.ts';

/**
 * An Atlas map tab as it was when found: its leaf, view, store and renderer. Atlas may build any of
 * them anew (a reload of Atlas, the view closed and opened, the renderer rebuilt), so a tab is only
 * used while all four are still the same objects.
 */
export interface AtlasTab {
  readonly leaf: WorkspaceLeaf;
  readonly view: object;
  readonly store: SceneStore;
  readonly renderer: object;
}

/** Atlas's view marks itself closing before it destroys its services (`AtlasView.isViewClosing`). */
const isClosing = (view: object): boolean => 'isViewClosing' in view && view.isViewClosing === true;

/** The leaf's Atlas tab while it can be shared: an Atlas view that is not closing, with a store and a renderer; else null. */
export function atlasTabOf(leaf: WorkspaceLeaf): AtlasTab | null {
  const view: unknown = leaf.view;
  if (typeof view !== 'object' || view === null || isClosing(view)) return null;
  const store = sceneStoreOf(leaf);
  const renderer = store === null ? null : rendererOf(leaf);
  return store !== null && typeof renderer === 'object' && renderer !== null ? { leaf, view, store, renderer } : null;
}

/** Whether a tab is still open and still the same view, store and renderer. */
export function isSameTab(tab: AtlasTab, open: readonly WorkspaceLeaf[]): boolean {
  if (!open.includes(tab.leaf)) return false;
  const now = atlasTabOf(tab.leaf);
  return now !== null && now.view === tab.view && now.store === tab.store && now.renderer === tab.renderer;
}

/** Whether a tab is the GM's own map, not a player view Atlas opened of it. */
const isGmTab = (tab: AtlasTab): boolean => (tab.store.getState() as { isPlayerView?: boolean }).isPlayerView !== true;

/** What a shared tab runs while it is shared. */
export interface TabBinding {
  start(): void;
  stop(): void;
  /** Atlas presents this tab of the bound view now, or none of its tabs (null): players then keep what they saw. */
  present(tab: PresentedTab | null): void;
  /** Whether the bound view shows the presented scene now. */
  readonly showing: boolean;
}

/** Why a shared tab was let go: its leaf was closed, its view or renderer went (Atlas reloads), or Atlas presents nothing. */
export type LostReason = 'closed' | 'gone' | 'unpresented';

export interface TabWatchPorts<B extends TabBinding> {
  /** The open Atlas leaves. */
  leaves(): readonly WorkspaceLeaf[];
  /** The scene tab Atlas presents to its player view, or null while it presents none. */
  presented(): Presented | null;
  /** Builds what shares a tab showing the presented scene; started once it is the watch's binding. */
  bind(tab: AtlasTab, presented: PresentedTab): B;
  /** The shared tab was let go and its binding stopped. */
  lost(reason: LostReason): void;
  /** The shared tab shows this presented map file now. */
  mapPath(path: string): void;
}

/**
 * Shares the scene Atlas presents to its player view (the eye on a scene tab), never the GM's own tab
 * switches. A view is bound once it shows the presented scene, and stays bound while its view, store and
 * renderer are the same objects; while the GM works on another tab its binding holds (players keep what
 * they saw). Once Atlas presents a tab of another view, that view is bound as soon as it shows it. A
 * binding whose tab is gone, or while Atlas presents nothing, is stopped at once.
 */
export class TabWatch<B extends TabBinding> {
  private readonly ports: TabWatchPorts<B>;
  private tab: AtlasTab | null = null;
  private shared: B | null = null;
  private target: PresentedTab | null = null;
  private path: string | null;
  private checking = false;
  private stopped = false;

  constructor(ports: TabWatchPorts<B>, mapPath: string | null) {
    this.ports = ports;
    this.path = mapPath;
  }

  /** The tab shared now, or null while none is. */
  get current(): AtlasTab | null {
    return this.tab;
  }

  /** What shares the tab now, or null while none is shared. */
  get binding(): B | null {
    return this.shared;
  }

  /** The presented tab as last found, or null while Atlas presents none of the open tabs. */
  get presented(): PresentedTab | null {
    return this.target;
  }

  /** The map file of the scene shared last, or null before one was shared. */
  get mapPath(): string | null {
    return this.path;
  }

  /**
   * Whether `binding` is the current one and its tab still the same; a binding found stale is let go
   * on the next microtask, so a caller inside it is never stopped under its feet.
   */
  isLive(binding: B): boolean {
    if (binding !== this.shared || this.tab === null) return false;
    if (isSameTab(this.tab, this.ports.leaves())) return true;
    queueMicrotask(() => this.check());
    return false;
  }

  /** Lets go of a tab that is gone, follows what Atlas presents, and binds the view that shows it. */
  check(): void {
    if (this.stopped || this.checking) return;
    this.checking = true;
    try {
      const open = this.ports.leaves();
      if (this.tab !== null && !isSameTab(this.tab, open)) this.release(open.includes(this.tab.leaf) ? 'gone' : 'closed');
      const target = findPresentedTab(open, this.ports.presented());
      this.target = target;
      if (this.shared !== null && target === null) this.release('unpresented');
      this.shared?.present(target !== null && target.leaf === this.tab?.leaf ? target : null);
      if (target !== null && target.leaf !== this.tab?.leaf) this.bindShowing(target);
      const path = this.shared?.showing === true ? this.tab?.store.getState().mapPath ?? null : null;
      if (path !== null && path !== this.path) {
        this.path = path;
        this.ports.mapPath(path);
      }
    } finally {
      this.checking = false;
    }
  }

  /** Stops the binding for good. */
  stop(): void {
    this.stopped = true;
    this.unbind();
  }

  /** Binds the presented tab's view once it shows the presented scene, in place of any other. */
  private bindShowing(target: PresentedTab): void {
    const tab = atlasTabOf(target.leaf);
    if (tab === null || !isGmTab(tab) || !showsPresented(tab.store.getState(), target)) return;
    this.unbind();
    this.tab = tab;
    const binding = this.ports.bind(tab, target);
    this.shared = binding;
    binding.start();
  }

  private release(reason: LostReason): void {
    this.unbind();
    this.ports.lost(reason);
  }

  private unbind(): void {
    const binding = this.shared;
    this.tab = null;
    this.shared = null;
    binding?.stop();
  }
}
