import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MarkdownRenderChild, type App, type MarkdownPostProcessorContext, type Plugin } from 'obsidian';
import { STATBLOCK_FENCE_LANGUAGE } from '../notes/statblockSource';
import { FenceStatblock } from './FenceStatblock';

export { STATBLOCK_FENCE_LANGUAGE };

/** Opens the statblock editor for a note; the plugin hands it in, so the fence never loads the editor itself. */
export type FenceEditAction = (path: string) => void;

/**
 * The statblock of the note a fence stands in, drawn while the fence is on
 * screen. The fence holds no data: the note's frontmatter is the statblock, so
 * whatever the fence's body says is ignored.
 */
export class StatblockFenceChild extends MarkdownRenderChild {
  private root: Root | null = null;

  constructor(
    containerEl: HTMLElement,
    private readonly app: App,
    private notePath: string,
    private readonly onEdit?: FenceEditAction,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.addClass('atlas-statblock-fence');
    this.root = createRoot(this.containerEl);
    this.draw();
    // An open note that is renamed keeps its rendered sections: the fence follows its note.
    const ref = this.app.vault.on('rename', (file, oldPath) => {
      if (oldPath !== this.notePath) return;
      this.notePath = file.path;
      this.draw();
    });
    this.register(() => this.app.vault.offref(ref));
  }

  private draw(): void {
    this.root?.render(React.createElement(FenceStatblock, { app: this.app, path: this.notePath, onEdit: this.onEdit }));
  }

  onunload(): void {
    // Obsidian may unload the section while React is rendering (a note shown inside an Atlas panel), where React refuses to unmount.
    const root = this.root;
    this.root = null;
    if (root) queueMicrotask(() => root.unmount());
  }
}

/** Renders an `atlas-statblock` fence: the statblock of the note it is in, read-only, with Edit statblock where `onEdit` is given. */
export function statblockFenceProcessor(app: App, onEdit?: FenceEditAction): (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void {
  return (_source, el, ctx) => {
    ctx.addChild(new StatblockFenceChild(el, app, ctx.sourcePath, onEdit));
  };
}

/** Registers the note fence; Obsidian removes the processor when the plugin unloads. */
export function registerStatblockFence(plugin: Pick<Plugin, 'app' | 'registerMarkdownCodeBlockProcessor'>, onEdit?: FenceEditAction): void {
  plugin.registerMarkdownCodeBlockProcessor(STATBLOCK_FENCE_LANGUAGE, statblockFenceProcessor(plugin.app, onEdit));
}
