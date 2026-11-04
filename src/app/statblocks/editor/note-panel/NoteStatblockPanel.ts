import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { App, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { noteName } from '../../../utils/pathUtils';
import { STATBLOCK_NOTE_CLASS } from '../../notes/openEditors';
import { observeResize } from '../../../utils/observeResize';
import type { PaneServices } from '../paneServices';
import type { EditTemplateOptions, PendingCommit, StatblockPaneActions, TemplateBlockTarget } from '../statblock-pane/paneTypes';
import { NotePanelRoot } from './NotePanelRoot';
import { measureNoteRoom, watchNoteRoom } from './noteRoom';
import { STACK_BELOW, panelWidth, type PanelPrefs } from './panelPrefs';
import { PanelScope } from './panelScope';
import { watchMarkdownTyping } from '../markdown-typing/markdownTyping';

/** On the view's container while its statblock shows: the content becomes a row, the note's fence shrinks. */
export const NOTE_PANEL_CLASS = STATBLOCK_NOTE_CLASS;
/** On the view's container while the panel's tray edits what Properties would show. */
export const HIDE_PROPERTIES_CLASS = 'atlas-sb-note--hide-properties';
/** On the view's container while the view is too narrow for two columns: the panel stands above the note. */
export const STACKED_CLASS = 'atlas-sb-note--stacked';

/** What the manager gives each panel. */
export interface PanelContext {
  app: App;
  services: PaneServices;
  actions: {
    /**
     * Opens the template editor on the note's template, in the note's own
     * leaf (§8.4), showing the note and, from a block's menu, that block.
     */
    openTemplate?: ((target: Omit<TemplateBlockTarget, 'blockId' | 'path'> & Partial<Pick<TemplateBlockTarget, 'blockId' | 'path'>>, leaf: WorkspaceLeaf) => void) | undefined;
  };
  prefs: () => PanelPrefs;
  /** A new width while dragging (`done` false) and once let go, which stores it. */
  setWidth: (width: number, done: boolean) => void;
  /** A drag of the edge that chose no width: the panel takes the width it had. */
  cancelResize: () => void;
  /** Forgets the width the user chose: every view takes its default again. */
  resetWidth: () => void;
}

/** What an entry point asks of the panel of the note it opened. */
export interface PanelRequest {
  /** The entry point's collection; resolved from the note's tokens when absent. */
  collectionId?: string | null | undefined;
  /** Focus the first empty value, as after creating a statblock. */
  focusFirstEmpty?: boolean | undefined;
}

/**
 * The statblock beside one Markdown view's note (§7.2): one element appended
 * to the view's content, where the editable card is drawn. Obsidian's editor and reader
 * stay where they are; only the stylesheet lays the content out as a row.
 */
export class NoteStatblockPanel {
  private host: HTMLElement | null = null;
  private root: Root | null = null;
  private collectionId: string | null = null;
  private propertiesShown = false;
  private stacked = false;
  private announcement = '';
  private focusRequest = 0;
  private readonly pendingCommit: PendingCommit = { current: null };
  private readonly teardown: Array<() => void> = [];
  private readonly keys: PanelScope;
  private readonly paneActions: StatblockPaneActions;

  constructor(readonly view: MarkdownView, private path: string, private readonly context: PanelContext) {
    this.keys = new PanelScope(context.app, {
      host: () => this.host,
      noteHistory: (kind) => this.context.services.writer[kind](this.path),
      noteName: () => noteName(this.path),
      say: (text) => {
        this.announcement = text;
        this.render();
      },
    });
    const open = context.actions.openTemplate;
    this.paneActions = {
      ...(open && {
        editTemplate: (templateId: string, collectionId: string | null, notePath: string, options?: EditTemplateOptions) => open({
          templateId, collectionId, notePath, ...(options?.path && { path: options.path }),
        }, this.view.leaf),
      }),
      showProperties: () => {
        this.propertiesShown = true;
        this.update();
      },
      changeCollection: (collectionId) => {
        if (this.collectionId === collectionId) return;
        this.collectionId = collectionId;
        this.render();
      },
    };
  }

  get notePath(): string {
    return this.path;
  }

  /** Whether the statblock is on screen. */
  get shown(): boolean {
    return this.host !== null;
  }

  /** The leaf now shows another statblock note: the panel starts over for it. */
  setNote(path: string): void {
    if (path === this.path) return;
    this.commitPending();
    this.path = path;
    this.collectionId = null;
    this.propertiesShown = false;
    this.update();
  }

  request(request: PanelRequest): void {
    if (request.collectionId) this.collectionId = request.collectionId;
    if (request.focusFirstEmpty) this.focusRequest += 1;
    this.render();
  }

  /** Brings the panel in line with the device's choices: its width. */
  update(): void {
    this.ensureHost();
    this.applyWidth();
    const { containerEl } = this.view;
    const shown = containerEl.hasClass(NOTE_PANEL_CLASS);
    containerEl.toggleClass(NOTE_PANEL_CLASS, this.host !== null);
    containerEl.toggleClass(HIDE_PROPERTIES_CLASS, this.host !== null && !this.propertiesShown);
    containerEl.toggleClass(STACKED_CLASS, this.host !== null && this.stacked);
    if (shown !== (this.host !== null)) this.announceShown();
    this.render();
  }

  /** Takes everything off the view; what is being typed is written to the note first. */
  detach(): void {
    this.removeHost();
    const shown = this.view.containerEl.hasClass(NOTE_PANEL_CLASS);
    this.view.containerEl.removeClass(NOTE_PANEL_CLASS, HIDE_PROPERTIES_CLASS, STACKED_CLASS);
    if (shown) this.announceShown();
  }

  /** Tells whoever follows the panel (the status bar) that it came or went. */
  private announceShown(): void {
    this.view.app.workspace.trigger('atlas-vtt:statblock-panel-changed');
  }

  private ensureHost(): void {
    if (this.host) return;
    const { contentEl } = this.view;
    const host = contentEl.createDiv({ cls: ['atlas-vtt-plugin', 'atlas-sb-note-panel'] });
    this.host = host;
    this.root = createRoot(host);
    const stopKeys = this.keys.watch(host);
    const stopTyping = watchMarkdownTyping(this.context.app, host, () => this.path);
    // Quitting closes no view, so the writer's last flush commits the text being typed (§8.5).
    const releasePending = this.context.services.writer.registerPending(() => this.pendingCommit.current?.() ?? Promise.resolve());
    const measure = (): void => {
      const stacked = contentEl.clientWidth > 0 && contentEl.clientWidth < STACK_BELOW;
      if (stacked === this.stacked) return;
      this.stacked = stacked;
      this.update();
    };
    const stopObserving = observeResize([contentEl], () => {
      measure();
      this.resizeWithView();
    });
    const stopWatching = watchNoteRoom(this.view, () => this.resizeWithView());
    this.teardown.push(() => {
      stopKeys();
      stopTyping();
      releasePending();
      stopObserving();
      stopWatching();
    });
    measure();
  }

  /** The width this view gives the panel: the chosen one, else its default for the room the note leaves. */
  private width(): number {
    return panelWidth(this.context.prefs(), measureNoteRoom(this.view));
  }

  /** Sets the panel's width; true when it changed. */
  private applyWidth(): boolean {
    const { host } = this;
    if (!host) return false;
    const width = `${this.width()}px`;
    if (host.style.getPropertyValue('--atlas-sb-panel-width') === width) return false;
    host.style.setProperty('--atlas-sb-panel-width', width);
    return true;
  }

  /** The view was resized or readable line width switched: the default follows, and the handle says so. */
  private resizeWithView(): void {
    if (this.applyWidth()) this.render();
  }

  private removeHost(): void {
    const { host, root } = this;
    if (!host) return;
    this.commitPending();
    this.keys.pop();
    for (const stop of this.teardown.splice(0)) stop();
    this.host = null;
    this.root = null;
    this.stacked = false;
    host.remove();
    // Never inside a render of React's: the switch may change from another root's event.
    queueMicrotask(() => root?.unmount());
  }

  /** Writes what is being typed, then the note's pending writes. */
  private commitPending(): void {
    const path = this.path;
    const { writer } = this.context.services;
    const commit = this.pendingCommit.current;
    this.pendingCommit.current = null;
    void (async () => {
      try {
        await commit?.();
        await writer.flush(path);
      } catch (error) {
        console.error(`[Atlas] Saving the statblock of ${path} failed:`, error);
      }
    })();
  }

  private render(): void {
    if (!this.root || !this.host) return;
    const { app, services } = this.context;
    this.root.render(React.createElement(NotePanelRoot, {
      pane: {
        app,
        services,
        notePath: this.path,
        collectionId: this.collectionId,
        propertiesShown: this.propertiesShown,
        announcement: this.announcement,
        focusRequest: this.focusRequest,
        pendingCommit: this.pendingCommit,
        actions: this.paneActions,
      },
      width: this.width(),
      stacked: this.stacked,
      availableWidth: () => this.view.contentEl.clientWidth,
      onResize: (width, done) => {
        this.host?.style.setProperty('--atlas-sb-panel-width', `${width}px`);
        this.context.setWidth(width, done);
      },
      onCancelResize: () => this.context.cancelResize(),
      onResetWidth: () => this.context.resetWidth(),
    }));
  }
}
