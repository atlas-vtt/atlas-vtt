import { TokenCreatorModal } from '../packages/components/asset-manager/token-creator/TokenCreatorModal';
import { Notice, Plugin, TFile } from 'obsidian';
import { AtlasView } from '../atlas-view';
import { DASHBOARD_VIEW_TYPE } from '../dashboard-view';
import { t } from '../i18n';
import type { GlobalAssetManagerService } from '../services/GlobalAssetManagerService';
import type { ImageDisplayService } from '../services/ImageDisplayService';
import { openPlayerWindow, presentActiveTab } from '../services/PlayerWindowPresenter';
import { hasBestiaryFrontmatter } from '../services/statblockNoteSource';
import { TokenStatblockLinkService } from '../services/TokenStatblockLinkService';
import { cleanupMissingAssets } from './cleanupMissingAssets';

export interface CommandDependencies {
  imageDisplay: ImageDisplayService;
  assetManager: GlobalAssetManagerService;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp'];

function isImageFile(file: TFile): boolean {
  return IMAGE_EXTENSIONS.includes(file.extension.toLowerCase());
}

async function openDashboard(plugin: Plugin): Promise<void> {
  try {
    const leaf = plugin.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, state: {} });
    plugin.app.workspace.setActiveLeaf(leaf);
  } catch (error) {
    console.error('[Atlas] Error opening dashboard:', error);
    new Notice(t('notice.dashboardOpenFailed'));
  }
}

function registerPlayerViewCommands(plugin: Plugin, imageDisplay: ImageDisplayService): void {
  const { workspace } = plugin.app;

  plugin.addCommand({
    id: 'display-image-on-player-view',
    name: t('command.displayImageOnPlayerView'),
    checkCallback: (checking) => {
      const file = workspace.getActiveFile();
      if (!file || !isImageFile(file)) return false;
      if (!checking) void imageDisplay.displayImageOnPlayerView(file);
      return true;
    },
  });

  plugin.addCommand({
    id: 'dismiss-image-from-player-view',
    name: t('command.dismissImageFromPlayerView'),
    checkCallback: (checking) => {
      if (!imageDisplay.isImageDisplayed()) return false;
      if (!checking) imageDisplay.closeImageDisplay();
      return true;
    },
  });

  plugin.addCommand({
    id: 'send-map-to-player-view',
    name: t('command.sendMapToPlayerView'),
    callback: () => void presentActiveTab(plugin.app),
  });

  plugin.addCommand({
    id: 'show-map-in-player-window',
    name: t('command.showMapInPlayerWindow'),
    callback: () => void presentActiveTab(plugin.app, { openWindow: true }),
  });

  plugin.addCommand({
    id: 'open-player-window',
    name: t('command.openPlayerWindow'),
    callback: () => void openPlayerWindow(plugin.app),
  });

  plugin.addRibbonIcon('monitor', t('command.displayImageOnPlayerView'), () => {
    const file = workspace.getActiveFile();
    if (file && isImageFile(file)) {
      void imageDisplay.displayImageOnPlayerView(file);
    } else {
      new Notice(t('notice.openImageFirst'));
    }
  });
}

function registerMapCommands(plugin: Plugin, deps: CommandDependencies): void {
  const { app } = plugin;

  plugin.addCommand({
    id: 'open-dashboard',
    name: t('command.openDashboard'),
    callback: () => void openDashboard(plugin),
  });

  plugin.addCommand({
    id: 'open-scene-browser',
    name: t('command.openSceneBrowser'),
    callback: () => deps.assetManager.open('scenes'),
  });

  plugin.addCommand({
    id: 'toggle-initiative-tracker',
    name: t('command.toggleInitiativeTracker'),
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(AtlasView);
      if (!view) return false;
      if (!checking) {
        const state = view.getStore().getState();
        state.setInitiativeTrackerOpen(!state.initiativeTrackerOpen);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'toggle-loot-roller',
    name: t('command.toggleLootRoller'),
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(AtlasView);
      if (!view) return false;
      if (!checking) {
        const state = view.getStore().getState();
        state.setLootRollerOpen(!state.lootRoller.open);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'toggle-dice-log',
    name: t('command.toggleDiceLog'),
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(AtlasView);
      if (!view) return false;
      if (!checking) {
        const state = view.getStore().getState();
        state.setDiceLogOpen(!state.isDiceLogOpen);
      }
      return true;
    },
  });

  plugin.addCommand({
    id: 'clean-up-missing-assets',
    name: t('command.cleanUpMissingAssets'),
    checkCallback: (checking) => {
      const view = app.workspace.getActiveViewOfType(AtlasView);
      if (!view) return false;
      if (!checking) void cleanupMissingAssets(app, view);
      return true;
    },
  });
}

function registerStatblockCommands(plugin: Plugin): void {
  const { app } = plugin;

  plugin.addCommand({
    id: 'import-statblock-tokens',
    name: t('command.importStatblockTokens'),
    callback: () => new TokenCreatorModal(app).open(),
  });

  plugin.addCommand({
    id: 'create-token-from-statblock',
    name: t('command.createTokenFromStatblock'),
    checkCallback: (checking) => {
      const file = app.workspace.getActiveFile();
      if (!file || !hasBestiaryFrontmatter(app, file)) return false;
      if (!checking) {
        void TokenStatblockLinkService.getInstance(app).createTokenFromStatblockImage(file.path);
      }
      return true;
    },
  });
}

export function registerCommands(plugin: Plugin, deps: CommandDependencies): void {
  registerPlayerViewCommands(plugin, deps.imageDisplay);
  registerMapCommands(plugin, deps);
  registerStatblockCommands(plugin);
}
