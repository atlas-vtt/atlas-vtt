/**
 * The statblock beside every native statblock note (§7.2): one manager per
 * app decorates each Markdown view, in every window, whose note names an
 * Atlas template while the `statblockEditor` switch is on, and takes the
 * decoration off again when the view shows another note, closes, or the
 * switch goes off. One view, one note: the panel edits the note the view shows.
 */

import { MarkdownView, type App, type EventRef, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import { SettingsService } from '../../../services/SettingsService';
import { cachedFrontmatter, frontmatterSource } from '../../notes/statblockSource';
import type { PaneServices } from '../paneServices';
import { NoteStatblockPanel, type PanelContext, type PanelRequest } from './NoteStatblockPanel';
import { loadPanelPrefs, savePanelPrefs, type PanelPrefs } from './panelPrefs';
import { setPanelPrefsSource, type PanelPrefsSource } from './panelPrefsSource';

export interface NoteStatblockPanelsDeps {
  services: (app: App) => PaneServices;
  actions: PanelContext['actions'];
}

const managers = new WeakMap<App, NoteStatblockPanels>();
/** How long a request waits for the panel of a note Obsidian has not read yet (a note just created). */
const REQUEST_WAIT_MS = 10_000;

export class NoteStatblockPanels implements PanelPrefsSource {
  /** The app's manager while Atlas is loaded; null before it starts and after it is released. */
  static forApp(app: App): NoteStatblockPanels | null {
    return managers.get(app) ?? null;
  }

  private readonly panels = new Map<MarkdownView, NoteStatblockPanel>();
  /** Requests for notes whose panel waits for the metadata cache, by path. */
  private readonly waiting = new Map<string, { request: PanelRequest; at: number }>();
  private readonly stops: Array<() => void> = [];
  private readonly context: PanelContext;
  private prefs: PanelPrefs;
  /** The width of the edge being dragged; stored only once it is let go. */
  private dragWidth: number | null = null;
  /** Hosts outside a note view that show the panel too (the template editor). */
  private readonly prefsListeners = new Set<() => void>();

  constructor(private readonly app: App, deps: NoteStatblockPanelsDeps) {
    this.prefs = loadPanelPrefs(app);
    this.context = {
      app,
      services: deps.services(app),
      actions: deps.actions,
      prefs: () => (this.dragWidth === null ? this.prefs : { ...this.prefs, width: this.dragWidth }),
      setWidth: (width, done) => this.setWidth(width, done),
      cancelResize: () => this.cancelResize(),
      resetWidth: () => this.store({ ...this.prefs, width: null }),
    };
  }

  /**
   * Follows the workspace. `file-open` fires only for the active leaf, so a
   * leaf that changes note while another has focus shows in `layout-change`;
   * a note that gains or loses its template shows in the metadata cache.
   */
  start(): void {
    managers.set(this.app, this);
    setPanelPrefsSource(this.app, this);
    const { workspace, metadataCache } = this.app;
    const refresh = (): void => this.refresh();
    const workspaceRefs: EventRef[] = [
      workspace.on('layout-change', refresh),
      workspace.on('active-leaf-change', refresh),
      workspace.on('file-open', refresh),
    ];
    const metadataRef = metadataCache.on('changed', refresh);
    const stopSettings = SettingsService.forApp(this.app)?.onChange(refresh);
    this.stops.push(() => {
      for (const ref of workspaceRefs) workspace.offref(ref);
      metadataCache.offref(metadataRef);
      stopSettings?.();
    });
    workspace.onLayoutReady(refresh);
  }

  /** Takes every panel off, writing what is being typed; called when Atlas unloads. */
  release(): void {
    for (const stop of this.stops.splice(0)) stop();
    for (const panel of this.panels.values()) panel.detach();
    this.panels.clear();
    this.waiting.clear();
    if (managers.get(this.app) === this) {
      managers.delete(this.app);
      setPanelPrefsSource(this.app, null);
    }
  }

  /** Decorates every view of a native statblock and undecorates every other one. */
  refresh(): void {
    const seen = new Set<MarkdownView>();
    this.app.workspace.iterateAllLeaves((leaf) => {
      // A block body: a truthy return value would stop the iteration. A deferred leaf has no MarkdownView yet.
      const { view } = leaf;
      if (view instanceof MarkdownView) {
        seen.add(view);
        this.evaluate(view);
      }
    });
    for (const [view, panel] of this.panels) {
      if (seen.has(view)) continue;
      panel.detach();
      this.panels.delete(view);
    }
  }

  /** The panel of the view a leaf holds, once that view is decorated. */
  panelOf(leaf: WorkspaceLeaf): NoteStatblockPanel | null {
    const { view } = leaf;
    return view instanceof MarkdownView ? this.panels.get(view) ?? null : null;
  }

  /** An entry point opened the note in `leaf`: its statblock takes the request. */
  reveal(leaf: WorkspaceLeaf, request: PanelRequest): void {
    const { view } = leaf;
    if (!(view instanceof MarkdownView)) return;
    const panel = this.evaluate(view);
    if (panel) panel.request(request);
    else if (view.file) this.waiting.set(view.file.path, { request, at: Date.now() });
  }

  panelPrefs(): PanelPrefs {
    return this.context.prefs();
  }

  setPanelWidth(width: number, done: boolean): void {
    this.setWidth(width, done);
  }

  cancelPanelResize(): void {
    this.cancelResize();
  }

  resetPanelWidth(): void {
    this.context.resetWidth();
  }

  onPrefsChange(listener: () => void): () => void {
    this.prefsListeners.add(listener);
    return () => { this.prefsListeners.delete(listener); };
  }

  private setWidth(width: number, done: boolean): void {
    if (done) this.store({ ...this.prefs, width });
    else this.dragWidth = width;
  }

  private cancelResize(): void {
    this.dragWidth = null;
    for (const panel of this.panels.values()) panel.update();
  }

  private store(prefs: PanelPrefs): void {
    this.dragWidth = null;
    this.prefs = prefs;
    savePanelPrefs(this.app, prefs);
    for (const panel of this.panels.values()) panel.update();
    for (const listener of this.prefsListeners) listener();
  }

  private evaluate(view: MarkdownView): NoteStatblockPanel | null {
    const panel = this.panels.get(view);
    const path = this.statblockPathOf(view, panel);
    if (path === null) {
      if (panel) {
        panel.detach();
        this.panels.delete(view);
      }
      return null;
    }
    if (panel) {
      panel.setNote(path);
      return panel;
    }
    const created = new NoteStatblockPanel(view, path, this.context);
    this.panels.set(view, created);
    created.update();
    const waiting = this.waiting.get(path);
    this.waiting.delete(path);
    if (waiting && Date.now() - waiting.at < REQUEST_WAIT_MS) created.request(waiting.request);
    return created;
  }

  /**
   * The note the view shows when it gets a panel: a native statblock. While
   * the metadata cache reads no properties (YAML being typed, or broken), a
   * note that has its panel keeps it, so the panel never blinks away mid-edit.
   */
  private statblockPathOf(view: MarkdownView, panel: NoteStatblockPanel | undefined): string | null {
    const { file } = view;
    if (!file || file.extension !== 'md' || !experimentalFeatureOn(this.app, 'statblockEditor')) return null;
    const frontmatter = cachedFrontmatter(this.app, file);
    if (frontmatterSource(frontmatter)?.kind === 'atlas') return file.path;
    return frontmatter === undefined && panel?.notePath === file.path ? file.path : null;
  }
}

/** Starts the app's manager; Atlas unloading releases it. */
export function registerNoteStatblockPanels(plugin: Plugin, deps: NoteStatblockPanelsDeps): NoteStatblockPanels {
  const panels = new NoteStatblockPanels(plugin.app, deps);
  panels.start();
  plugin.register(() => panels.release());
  return panels;
}
