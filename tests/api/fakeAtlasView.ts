/**
 * A stand-in for `src/app/atlas-view` in the remote view tests (`vi.mock`): a map view with a real
 * store (remote when asked), tab meta, a laser hub, an event bus and a fake viewport, and no PIXI.
 * Obsidian's `register` callbacks run when the view closes, as they do when a view unloads.
 */
import { EventEmitter } from 'events';
import { LaserHub } from '../../src/app/pixi/laser/LaserHub';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createTabMetaStore, type TabMetaStore } from '../../src/app/stores/tabMetaStore';

export const ATLAS_VIEW_TYPE = 'atlas-vtt';

let made = 0;

/** pixi-viewport, as far as the remote view moves and watches it. */
export class FakeRemoteViewport {
  center = { x: 0, y: 0 };
  scale = { x: 1, y: 1 };
  screenWidth = 800;
  screenHeight = 600;
  destroyed = false;
  private readonly listeners = new Map<string, Set<(event: { type: string }) => void>>();
  get worldScreenWidth(): number { return this.screenWidth / this.scale.x; }
  get worldScreenHeight(): number { return this.screenHeight / this.scale.x; }
  setZoom(zoom: number): this { this.scale = { x: zoom, y: zoom }; return this; }
  moveCenter(x: number, y: number): this { this.center = { x, y }; return this; }
  on(event: string, listener: (event: { type: string }) => void): this {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(listener);
    return this;
  }
  off(event: string, listener: (event: { type: string }) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }
  /** pixi-viewport's `moved` after one of its plugins (`drag`, `wheel` …) moved it. */
  moved(type: string): void {
    for (const listener of [...(this.listeners.get('moved') ?? [])]) listener({ type });
  }
  frame(): void {
    for (const listener of [...(this.listeners.get('frame-end') ?? [])]) listener({ type: 'frame-end' });
  }
}

/** The renderer's part the remote view uses: the background sprite, the grid and the lasers. */
export class FakeRemoteRenderer {
  readonly laserHub = new LaserHub();
  background: { width: number; height: number; destroyed: boolean } | null = null;
  grid: unknown = null;
  constructor(private readonly viewport: FakeRemoteViewport) {}
  getBackgroundSprite(): { width: number; height: number; destroyed: boolean } | null { return this.background; }
  getViewportInstance(): FakeRemoteViewport { return this.viewport; }
  getLaserHub(): LaserHub { return this.laserHub; }
  setBackgroundSprite(sprite: { width: number; height: number; destroyed: boolean }): void { this.background = sprite; }
  initGrid(): void { this.grid = {}; }
  getGridSystem(): unknown { return this.grid; }
}

interface FakeLeafLike { app: unknown; detach(): void }

export class AtlasView {
  navigation = true;
  readonly app: never;
  readonly leaf: FakeLeafLike;
  readonly viewId: string;
  readonly atlasStore: ViewAtlasStore;
  readonly tabMetaStore: TabMetaStore = createTabMetaStore();
  readonly viewport = new FakeRemoteViewport();
  readonly renderer = new FakeRemoteRenderer(this.viewport);
  readonly eventBus = new EventEmitter();
  readonly containerEl: HTMLElement = document.createElement('div');
  readonly serviceManager = {
    getRendererService: () => ({ getViewport: () => this.viewport }),
    getEventBus: () => this.eventBus,
  };
  private closed = false;
  private readonly closers: Array<() => void> = [];

  constructor(leaf: FakeLeafLike, _plugin?: unknown, isPlayerView = false, remote = false) {
    this.leaf = leaf;
    this.app = leaf.app as never;
    this.viewId = `view-${++made}`;
    this.atlasStore = createViewAtlasStore(leaf.app as never, this.viewId, undefined, isPlayerView, { remote });
    (this.containerEl as HTMLElement & { addClass(cls: string): void }).addClass = (cls: string): void => this.containerEl.classList.add(cls);
  }

  get isClosed(): boolean { return this.closed; }
  get isRemote(): boolean { return this.atlasStore.getState().remoteView != null; }
  register(callback: () => void): void { this.closers.push(callback); }
  switchToTab(): Promise<void> { return Promise.resolve(); }
  async onOpen(): Promise<void> { this.closed = false; }
  async onClose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const callback of this.closers.splice(0)) callback();
  }
}
