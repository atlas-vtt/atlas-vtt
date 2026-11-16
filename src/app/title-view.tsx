import { ItemView, type App } from 'obsidian';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { t } from './i18n';
import { TitlePane } from './react/components/dm-screen/title/TitlePane';
import { AtlasUIContext } from './react/root/AtlasUIContext';
import { ContextMenuProvider } from './react/root/ContextMenuContext';

export const TITLE_VIEW_TYPE = 'atlas-title';

export class TitleView extends ItemView {
  private root: Root | null = null;

  getViewType(): string { return TITLE_VIEW_TYPE; }
  getDisplayText(): string { return t('titleCards.heading'); }
  getIcon(): string { return 'presentation'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('atlas-vtt-plugin', 'atlas-title-view');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <AtlasUIContext.Provider value={{ app: this.app, view: null, pixiApp: null, renderer: null }}>
        <ContextMenuProvider local><TitlePane app={this.app} /></ContextMenuProvider>
      </AtlasUIContext.Provider>,
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}

export async function showTitleView(app: App): Promise<void> {
  const leaf = app.workspace.getLeavesOfType(TITLE_VIEW_TYPE)[0] ?? app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: TITLE_VIEW_TYPE, active: true });
  await app.workspace.revealLeaf(leaf);
}
