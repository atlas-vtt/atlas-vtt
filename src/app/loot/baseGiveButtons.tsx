import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileView, type App, type Plugin } from 'obsidian';
import { LootGiveButton } from '../react/components/loot/LootGiveButton';
import { AssetService } from '../services/AssetService';
import { baseItemDraw, lootBaseCollection, type BaseColumns } from './baseItemDraw';
import './base-give.scss';

/*
 * Obsidian gives plugins no way into its own Bases table, so the button is put into the table's
 * markup: each row's name cell is `.bases-td[data-property="file.name"]` holding the note's link.
 * Rows are recycled as the table scrolls, so cells are read again whenever the table changes.
 * Should Obsidian change that markup, the cells are not found and there is simply no button.
 */
const NAME_CELL = '.bases-tbody .bases-td[data-property="file.name"]';

/** The table's columns: the property ids of a row's cells, named by the header cells in the same order. */
function columnsOf(table: HTMLElement): BaseColumns {
  const order = [...table.querySelectorAll<HTMLElement>('.bases-tbody .bases-tr:first-child > .bases-td')].flatMap((cell) => cell.dataset.property ?? []);
  const names = [...table.querySelectorAll<HTMLElement>('.bases-thead .bases-table-header-name')].map((name) => name.textContent ?? '');
  return { order, displayNames: Object.fromEntries(order.flatMap((id, index) => (names[index] ? [[id, names[index]]] : []))) };
}

interface Mounted {
  host: HTMLElement;
  root: Root;
  /** The item note the cell shows. */
  path: string | null;
}

function BaseGiveButton({ app, basePath, notePath, columns }: { app: App; basePath: string; notePath: string; columns: BaseColumns }): React.ReactElement | null {
  const draw = baseItemDraw(app, basePath, notePath, columns);
  return draw ? <LootGiveButton draw={draw} className="atlas-base-give__button" /> : null;
}

/** The give buttons in one open loot base; exported for its tests. */
export class BaseDecoration {
  private readonly mounted = new Map<HTMLElement, Mounted>();
  private readonly observer: MutationObserver;
  private columns: BaseColumns = { order: [], displayNames: {} };
  private frame: number | null = null;

  constructor(private readonly app: App, private readonly el: HTMLElement, readonly basePath: string) {
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-href', 'data-property'] });
    this.scan();
  }

  /** Draws the buttons of the item note (all of them without one) again, as its properties changed. */
  refresh(notePath?: string): void {
    for (const mounted of this.mounted.values()) if (notePath === undefined || mounted.path === notePath) this.render(mounted);
  }

  destroy(): void {
    this.observer.disconnect();
    if (this.frame !== null) this.el.win.cancelAnimationFrame(this.frame);
    for (const [cell, mounted] of this.mounted) this.unmount(cell, mounted);
  }

  private schedule(): void {
    this.frame ??= this.el.win.requestAnimationFrame(() => {
      this.frame = null;
      this.scan();
    });
  }

  private scan(): void {
    const columns = columnsOf(this.el);
    const columnsChanged = JSON.stringify(columns) !== JSON.stringify(this.columns);
    this.columns = columns;
    const cells = new Set(this.el.querySelectorAll<HTMLElement>(NAME_CELL));
    for (const [cell, mounted] of this.mounted) if (!cells.has(cell) || !mounted.host.isConnected) this.unmount(cell, mounted);
    for (const cell of cells) {
      const href = cell.querySelector('.internal-link')?.getAttribute('data-href');
      const path = href ? this.app.metadataCache.getFirstLinkpathDest(href, this.basePath)?.path ?? null : null;
      let mounted = this.mounted.get(cell);
      if (!mounted) {
        cell.addClass('atlas-base-give-cell');
        const host = cell.createSpan({ cls: ['atlas-vtt-plugin', 'atlas-base-give'] });
        // The cell's own handlers (selecting it, opening the note) never hear a press on the button.
        for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick'] as const) host.addEventListener(type, (event) => event.stopPropagation());
        mounted = { host, root: createRoot(host), path: null };
        this.mounted.set(cell, mounted);
      } else if (mounted.path === path && !columnsChanged) continue;
      mounted.path = path;
      this.render(mounted);
    }
  }

  private render(mounted: Mounted): void {
    mounted.root.render(mounted.path === null ? null : <BaseGiveButton app={this.app} basePath={this.basePath} notePath={mounted.path} columns={this.columns} />);
  }

  private unmount(cell: HTMLElement, mounted: Mounted): void {
    mounted.root.unmount();
    mounted.host.remove();
    cell.removeClass('atlas-base-give-cell');
    this.mounted.delete(cell);
  }
}

/**
 * Puts a give button into the name cell of every item in an open loot base (a base a collection
 * rolls loot on), so the GM can hand any item to the players, not only rolled ones.
 * ponytail: base tabs only; a base embedded in a note gets no buttons.
 */
export function registerBaseGiveButtons(plugin: Plugin): void {
  const { app } = plugin;
  const decorations = new Map<HTMLElement, BaseDecoration>();

  const sync = (): void => {
    const shown = new Set<HTMLElement>();
    for (const leaf of app.workspace.getLeavesOfType('bases')) {
      const { view } = leaf;
      if (!(view instanceof FileView) || !view.file || lootBaseCollection(app, view.file.path) === null) continue;
      const el = view.containerEl;
      shown.add(el);
      const existing = decorations.get(el);
      if (existing?.basePath === view.file.path) continue;
      existing?.destroy();
      decorations.set(el, new BaseDecoration(app, el, view.file.path));
    }
    for (const [el, decoration] of decorations) {
      if (shown.has(el)) continue;
      decoration.destroy();
      decorations.delete(el);
    }
  };

  plugin.registerEvent(app.workspace.on('layout-change', sync));
  plugin.registerEvent(app.workspace.on('file-open', sync));
  plugin.registerEvent(app.workspace.on('atlas-vtt:collection-settings-changed', sync));
  plugin.registerEvent(app.metadataCache.on('changed', (file) => {
    for (const decoration of decorations.values()) decoration.refresh(file.path);
  }));
  app.workspace.onLayoutReady(sync);
  // Which bases are loot bases is known once the asset index has loaded.
  AssetService.getInstance(app).initialize().then(sync, () => undefined);
  plugin.register(() => {
    for (const decoration of decorations.values()) decoration.destroy();
    decorations.clear();
  });
}
