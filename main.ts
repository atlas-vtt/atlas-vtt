import './src/app/plugin/host/initializeHost';
import { Plugin } from 'obsidian';
// Tailwind first, so the custom SCSS can override it.
import './styles/index.css';
import './styles/main.scss';
import { AtlasView, ATLAS_VIEW_TYPE } from './src/app/atlas-view';
import { LocalPlayerView, LOCAL_PLAYER_VIEW_TYPE } from './src/app/local-player-view';
import { DashboardView, DASHBOARD_VIEW_TYPE } from './src/app/dashboard-view';
import { initializeAtlasStorage } from './src/app/atlasStorageInit';
import { t } from './src/app/i18n';
import { CreatureIndex } from './src/app/creatures/CreatureIndex';
import { disposeImageProcessing } from './src/app/imageProcessing/imageProcessing';
import { registerLootQueryView } from './src/app/loot/lootQueryView';
import { GlobalAssetManagerService } from './src/app/services/GlobalAssetManagerService';
import { ImageDisplayService } from './src/app/services/ImageDisplayService';
import { PlayerLootDisplay } from './src/app/services/PlayerLootDisplay';
import { LootHistoryStore } from './src/app/loot/LootHistoryStore';
import { PlayerWindowService } from './src/app/services/PlayerWindowService';
import { AssetService } from './src/app/services/AssetService';
import { SettingsService } from './src/app/services/SettingsService';
import { addStarterTokens } from './src/app/services/starterTokens';
import { migratePlayerResourceVisibility } from './src/app/resources/playerVisibilityMigration';
import { storeLegacyCollectionResources } from './src/app/services/collectionScenes';
import type { WidgetSyncService } from './src/app/services/WidgetSyncService';
import { AtlasSettingTab } from './src/app/settings/AtlasSettingTab';
import { changelogSettingsSection } from './src/app/settings/changelogSettingsSection';
import { hotkeySettingsSection, onboardingSettingsSection } from './src/app/settings/hotkeySettingsSection';
import { navigationSettingsSection } from './src/app/settings/navigationSettingsSection';
import { diceSettingsSection } from './src/app/settings/diceSettingsSection';
import { registerDiceLookSync } from './src/app/plugin/diceLookSync';
import { registerDiceStageRelease } from './src/app/plugin/diceStageRelease';
import { supportSettingsSection } from './src/app/settings/supportSettingsSection';
import { registerAtlasLeafSync } from './src/app/plugin/atlasLeaves';
import { EXTENSION_ATLASMAP } from './src/app/utils/sceneFiles';
import { registerColorSwatchIcons } from './src/app/plugin/colorSwatchIcons';
import { HeaderAutocompleteSuggest } from './src/app/plugin/HeaderAutocompleteSuggest';
import { registerAtlasLinks } from './src/app/links/registerAtlasLinks';
import { registerCommands } from './src/app/plugin/registerCommands';
import { registerPlayerWindowReloadCleanup } from './src/app/plugin/playerWindowReload';
import { registerReturnToAtlasOnClose } from './src/app/plugin/returnToAtlasOnClose';
import { runStartupMigration } from './src/app/plugin/startupMigration';
import { migrateLegacySnapshots } from './src/app/snapshots/legacySnapshotMigration';
import { migrateSettingsToPluginData } from './src/app/plugin/settingsMigration';
import { SystemPresetFiles } from './src/app/services/systemPresets/SystemPresetFiles';
import { registerStatusBarVisibility } from './src/app/plugin/statusBarVisibility';
import { registerVaultSync } from './src/app/plugin/vaultSync';
import { ChangelogService } from './src/app/changelog/ChangelogService';
import { AtlasErrorLog } from './src/app/support/errorLog';
import { IssueReporter } from './src/app/support/IssueReporter';
import { runInBackground } from './src/app/utils/backgroundTask';

declare const __ATLAS_RELEASE_BUILD__: boolean;

export default class AtlasVTTPlugin extends Plugin {
  /** Read by each view's ServiceManager so all views share one settings instance. */
  public settingsService!: SettingsService;
  /** Created lazily by the first view's ServiceManager and shared by all views. */
  public widgetSyncService: WidgetSyncService | undefined;

  /** Opened by each view for its scene browser. */
  public globalAssetManager!: GlobalAssetManagerService;
  private imageDisplayService!: ImageDisplayService;
  private changelogService: ChangelogService | undefined;

  async onload(): Promise<void> {
    // Record errors from the very start so startup problems can be reported too.
    const errorLog = new AtlasErrorLog();
    this.register(errorLog.attach());
    const issueReporter = new IssueReporter(this.app, this.manifest, errorLog);
    this.addCommand({ id: 'report-issue', name: t('command.reportIssue'), callback: () => issueReporter.open() });

    // Capture this before migrations/services can create Atlas's storage folder.
    const existingInstallation = this.app.vault.adapter.exists('atlas-vtt');
    const storageReady = existingInstallation.then(async () => {
      await initializeAtlasStorage(this.app);
      await runStartupMigration(this.app);
    });
    // The user's game system presets are vault files; reading them needs no migration.
    const presetFiles = SystemPresetFiles.open(this.app);
    // Settings carried over even when the data file migration failed, so they are not lost to the defaults.
    const settingsReady = storageReady.catch(() => undefined).then(async () => {
      await presetFiles.load();
      await migrateSettingsToPluginData(this.app, this, presetFiles);
    }).catch((error: unknown) => console.error('[Atlas] Carrying the settings over into the plugin data failed:', error));
    // Created before the views so every restored tab shares it; it reads the
    // plugin's data only once the migration has put the settings there.
    this.settingsService = new SettingsService(this.app, settingsReady, this);

    // Before the views: a restored map may start Atlas's first check of the vault,
    // whose folder renames reach map files only through these vault events.
    registerVaultSync(this);
    registerDiceStageRelease(this);
    // Views first, so workspace restore can resolve persisted Atlas tabs
    // before the slower startup path finishes.
    this.registerAtlasViews();

    await storageReady;
    await this.settingsService.initialize();
    registerDiceLookSync(this, this.settingsService);
    const changelogService = new ChangelogService(this.app, this.settingsService, {
      installedVersion: this.manifest.version,
      existingInstallation: await existingInstallation,
      releaseBuild: __ATLAS_RELEASE_BUILD__,
    });
    this.changelogService = changelogService;
    this.addCommand({ id: 'view-changelog', name: t('command.viewChangelog'), callback: () => changelogService.open() });

    this.globalAssetManager = new GlobalAssetManagerService(this.app);
    this.imageDisplayService = new ImageDisplayService(this.app);

    this.addSettingTab(new AtlasSettingTab(this.app, this, () => [
      navigationSettingsSection(this.settingsService),
      diceSettingsSection(this.settingsService),
      hotkeySettingsSection(this.settingsService),
      onboardingSettingsSection(this.settingsService),
      changelogSettingsSection(this.settingsService, changelogService, this.manifest.version),
      supportSettingsSection(issueReporter),
    ]));
    this.registerEditorSuggest(new HeaderAutocompleteSuggest(this.app));
    registerAtlasLinks(this);
    registerAtlasLeafSync(this);
    registerReturnToAtlasOnClose(this);
    registerPlayerWindowReloadCleanup(this);
    registerCommands(this, {
      imageDisplay: this.imageDisplayService,
      assetManager: this.globalAssetManager,
    });

    this.app.workspace.onLayoutReady(() => {
      registerColorSwatchIcons();
      this.imageDisplayService.registerContextMenu();
      registerStatusBarVisibility(this);
      this.changelogService?.showUpdates();
      runInBackground(addStarterTokens(this.app, AssetService.getInstance(this.app), this.settingsService), 'Adding the starter tokens');
      runInBackground(this.carryOverTokenBars(), 'Carrying over the token bar settings');
      runInBackground(migrateLegacySnapshots(this.app, AssetService.getInstance(this.app)), 'Moving scene snapshots into their collections');
    });
  }

  /**
   * Once per collection and vault: the HP and secondary bars of collections saved before
   * resources existed become their resources, and what the old player-window switches
   * showed becomes "visible to players" on them.
   */
  private async carryOverTokenBars(): Promise<void> {
    await this.settingsService.initialize();
    const assets = AssetService.getInstance(this.app);
    await assets.initialize();
    await storeLegacyCollectionResources(this.app);
    await migratePlayerResourceVisibility(this.settingsService, assets);
  }

  /** Obsidian calls this when `data.json` changed on disk, e.g. a sync brought another device's settings. */
  async onExternalSettingsChange(): Promise<void> {
    await this.settingsService?.reload();
  }

  onunload(): void {
    this.changelogService?.destroy();
    void this.settingsService?.saveSettingsNow();
    SystemPresetFiles.release(this.app);
    this.widgetSyncService?.destroy();
    this.widgetSyncService = undefined;

    this.imageDisplayService?.destroy();
    PlayerLootDisplay.get().dispose();
    LootHistoryStore.release(this.app);
    PlayerWindowService.getInstance()?.destroy(false);
    this.globalAssetManager?.close();
    CreatureIndex.release(this.app);
    disposeImageProcessing();
  }

  private registerAtlasViews(): void {
    this.registerExtensions([EXTENSION_ATLASMAP], ATLAS_VIEW_TYPE);
    this.registerView(ATLAS_VIEW_TYPE, (leaf) => new AtlasView(leaf, this));
    this.registerView(LOCAL_PLAYER_VIEW_TYPE, (leaf) => new LocalPlayerView(leaf));
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new DashboardView(leaf, this));
    registerLootQueryView(this);
  }
}
