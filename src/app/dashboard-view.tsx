import { ItemView, WorkspaceLeaf } from "obsidian";
import type AtlasVTTPlugin from '../../main';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { AssetService } from './services/AssetService';
import { GlobalAssetManagerService } from './services/GlobalAssetManagerService';
import { runInBackground } from './utils/backgroundTask';
import { t } from './i18n';
import { showNotice } from './ui/notice';
import { CampaignFiles } from './campaigns/CampaignFiles';
import { Dashboard } from './react/components/dashboard/Dashboard';

export const DASHBOARD_VIEW_TYPE = "atlas-vtt-dashboard";

/**
 * Dashboard View - Welcome screen and main entry point for Atlas VTT
 */
export class DashboardView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: AtlasVTTPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('dashboard.title');
  }

  getIcon(): string {
    return "home";
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('atlas-vtt-plugin');
    containerEl.addClass('atlas-dashboard-view');

    try {
      this.root = createRoot(containerEl);

      this.root.render(
        <Dashboard
          app={this.app}
          campaignStorage={CampaignFiles.forApp(this.app)}
          onOpenScene={(filePath) => { void this.handleOpenScene(filePath); }}
          onCreateMap={() => runInBackground(this.handleCreateMap(), 'Opening the map picker', 'Could not open the asset manager')}
          onOpenAssetManager={() => this.handleOpenAssetManager()}
        />
      );
    } catch (error) {
      console.error('[DashboardView] Error during React rendering:', error);
      containerEl.createDiv({ text: t('dashboard.failed') });
    }
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  private async handleOpenScene(filePath: string): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        showNotice(t('view.sceneNotFound', { path: filePath }));
        return;
      }

      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: 'atlas-vtt',
        state: { file: filePath }
      });
      this.app.workspace.setActiveLeaf(leaf);
    } catch (error) {
      console.error('Error opening scene:', error);
      showNotice(t('dashboard.openFailed'));
    }
  }

  private async handleCreateMap(): Promise<void> {
    const assetService = AssetService.getInstance(this.app);
    const maps = await assetService.getAssets(undefined, 'map');

    if (maps.length === 0) {
      showNotice(t('dashboard.addMapFirst'));
    }

    const globalAM = new GlobalAssetManagerService(this.app);
    globalAM.open('maps');
  }

  private handleOpenAssetManager(): void {
    const globalAM = new GlobalAssetManagerService(this.app);
    globalAM.open('scenes');
  }
}
