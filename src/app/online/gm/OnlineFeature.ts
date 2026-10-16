import { runInBackground } from '../../utils/backgroundTask';
import { isImageUrl } from '../../utils/imageSource';
import { Component, type App, type Plugin, type TFile } from 'obsidian';
import { showNotice } from '../../ui/notice';
import type { AtlasSettingSection } from '../../settings/settingSections';
import { AccountControl } from './account/AccountControl.ts';
import { obsidianHttp } from './account/obsidianHttp.ts';
import { secretTokenStore } from './account/tokenStore.ts';
import { activeAtlasLeaf } from './atlasView.ts';
import { BookShelf } from './book/BookShelf.ts';
import { readBooks } from './book/bookStore.ts';
import { CompanionDiagnostics } from './companionDiagnostics.ts';
import { companionTimers, every, stopCompanionTimers } from './companionTimers.ts';
import { DockMounts } from './dock/DockMounts.ts';
import { ImageTakeover } from './image/imageTakeover.ts';
import { atlasImageDisplay, localPlayerWindowOpen, readShownFile } from './image/atlasImageHost.ts';
import { LogMounts } from './log/LogMounts.ts';
import { TableChat } from './tableChat.ts';
import { lootCardOf } from './log/lootCard.ts';
import { PlayerLootDisplay } from '../../services/PlayerLootDisplay';
import { copyText } from './dock/dockDom.ts';
import { onlineApi } from './dock/panelModel.ts';
import type { OnlineCommandId } from './onlineCommands.ts';
import { OnlineControl } from './OnlineControl.ts';
import type { OnlineDataFile } from './onlineData.ts';
import type { OnlineTable } from './OnlineTable.ts';
import { Ownership, readOwnership } from './ownership.ts';
import { readSavedTable, type SavedTable } from './savedTable.ts';
import { DEFAULT_SETTINGS, onlineSettingsSections, readSettings, type OnlineSettings } from './settings.ts';

/** How long a change of the table's log or of a player's book waits before the data file is written. */
const LOG_SAVE_MS = 10_000;
/** How often the tab the table's log stands on and Atlas's image display are looked for. */
const SYNC_MS = 1_000;

const tokensText = (count: number): string => (count === 1 ? '1 token' : `${count} tokens`);

/**
 * Online play: shares the scene of an Atlas map tab with players in their browsers. A child of the
 * plugin, loaded while the GM has online play switched on. Nothing connects until the GM starts a table.
 */
export class OnlineFeature extends Component {
  settings: OnlineSettings = { ...DEFAULT_SETTINGS };
  /** The GM's side of online play, for panels and commands: table, players and player tokens. */
  online: OnlineControl;
  /** The GM's Atlas account, which tables are asked for with. */
  readonly account: AccountControl;
  private readonly app: App;
  /** The running table as saved in this device's data, so a reload comes back to it. */
  private savedTable: SavedTable | null = null;
  /** The running table's log as saved with it; undefined while there is none. */
  private savedLog: unknown = undefined;
  private logSave: number | null = null;
  /** The players' books kept on this device; they outlive tables. */
  private books = new BookShelf();
  private docks: DockMounts | null = null;
  private logs: LogMounts | null = null;
  /** The table's log for other plugins (`TableChat`). */
  readonly chat = new TableChat(() => (this.ready ? this.online.table : null));
  /** False before loading and after unloading: commands are offered and data is taken in only while true. */
  private live = false;
  /** True once this device's data was read: before that there is nothing to show in the settings, or to save. */
  private ready = false;
  private readonly commands = new Map<OnlineCommandId, (checking: boolean) => boolean>();

  constructor(private readonly plugin: Plugin, private readonly data: OnlineDataFile) {
    super();
    this.app = plugin.app;
    this.online = new OnlineControl(this.app, new Ownership(readOwnership(undefined), () => undefined));
    this.account = new AccountControl({
      http: obsidianHttp,
      timers: companionTimers(),
      tokens: secretTokenStore(this.app),
      openUrl: (url) => void window.open(url),
      notify: (text) => showNotice(text),
    });
  }

  /** The running table, or null. */
  get table(): OnlineTable | null {
    return this.online.table;
  }

  /** Online play's sections of Atlas's settings; none until its data was read, so no row can save over it. */
  settingsSections(): AtlasSettingSection[] {
    return this.ready ? onlineSettingsSections(this) : [];
  }

  /** Runs one of online play's commands, or checks whether it can run now. */
  runCommand(id: OnlineCommandId, checking: boolean): boolean {
    return this.live && (this.commands.get(id)?.(checking) ?? false);
  }

  onload(): void {
    this.live = true;
    void this.start().catch((error: unknown) => console.error('[Atlas] Online play could not start:', error));
  }

  private async start(): Promise<void> {
    const version = this.plugin.manifest.version;
    // Online play's own uncaught errors go to the console, and to the table's server once the GM switched error reports on.
    const diagnostics = new CompanionDiagnostics({
      reportErrors: () => this.settings.reportErrors,
      setReportErrors: (on) => {
        this.settings.reportErrors = on;
        void this.saveSettings();
      },
      table: () => this.savedTable,
      playerNames: () => this.online.players().map((player) => player.name),
      connection: () => this.online.table?.connectionStats() ?? null,
    }, version, () => version);
    this.register(diagnostics.listen(window));
    const data = await this.data.read();
    // Switched off while the data was read: nothing more is set up.
    if (!this.live) return;
    this.settings = readSettings(data);
    this.ready = true;
    const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const ownership = new Ownership(readOwnership(record.ownership), () => void this.saveSettings());
    this.savedTable = readSavedTable(record.table);
    this.savedLog = this.savedTable === null ? undefined : record.tableLog;
    this.books = new BookShelf(readBooks(record.books), () => this.saveSoon());
    this.online = new OnlineControl(this.app, ownership, (table) => {
      this.savedTable = table;
      void this.saveSettings();
    }, this.account, { read: () => this.savedLog, write: (entries) => this.keepLog(entries) }, this.books);
    // Atlas's "Display on player view" reaches the players online too, while a table runs.
    const images = new ImageTakeover<TFile>(() => atlasImageDisplay(this.app), {
      share: () => this.online.table?.image ?? null,
      readFile: (file) => readShownFile(this.app, file),
      pathOf: (file) => file.path,
      localWindowOpen: () => localPlayerWindowOpen(this.app),
      notice: (text) => showNotice(text),
    });
    this.register(() => images.dispose());
    // Loot handed out from the roller goes into the table's log while a table runs.
    const loot = PlayerLootDisplay.get();
    loot.setOutlet((draw) => {
      const item = this.online.table === null ? null : lootCardOf(draw);
      if (item === null) return false;
      this.online.table?.log.lootHanded(item);
      return true;
    });
    this.register(() => loot.setOutlet(null));
    const docks = new DockMounts(this.app.workspace, {
      api: onlineApi(this.online, () => images.hide()),
      account: this.account,
      imageSrc: (path) => (isImageUrl(path) ? path : this.app.vault.adapter.getResourcePath(path)),
      feedback: diagnostics,
      opened: (leaf) => logs.close(leaf),
    });
    this.docks = docks;
    // The table's log, where Atlas's dice log opens on the tab players see.
    const logs = new LogMounts({
      table: () => this.online.table,
      imageSrc: (path) => (isImageUrl(path) ? path : this.app.vault.adapter.getResourcePath(path)),
      opened: (leaf) => docks.dockOf(leaf)?.makeWay(),
      openNote: (link, sourcePath) => runInBackground(this.app.workspace.openLinkText(link, sourcePath, true), `Opening ${link}`, 'Could not open the found note'),
    });
    this.logs = logs;
    this.register(this.online.onChange(() => (logs.sync(), logs.refresh(), images.sync(), this.chat.sync())));
    this.register(() => this.chat.dispose());
    this.register(this.online.logs.onChange(() => logs.logChanged()));
    // Which tab players see changes without a word (Atlas presents another, the tab closes), and so does Atlas's image display: looked at as often as the table looks.
    this.register(every(companionTimers(), SYNC_MS, () => (logs.sync(), images.sync())));
    this.app.workspace.onLayoutReady(() => {
      if (!this.live) return;
      // A table that ran when Obsidian or Atlas was last unloaded comes back with the same link.
      if (this.savedTable !== null) this.online.resume(this.savedTable);
      // A signed-in GM's session is renewed, and the dock learns what it may host.
      void this.account.refresh(true);
      docks.sync();
      logs.sync();
    });
    this.command('start-online-table', (checking) => {
      const leaf = activeAtlasLeaf(this.app);
      if (!this.online.canStart() || leaf === null) return false;
      if (!checking) {
        docks.dockOf(leaf)?.open();
        void this.online.start(leaf);
      }
      return true;
    });
    this.command('toggle-online-panel', (checking) => {
      const leaf = activeAtlasLeaf(this.app);
      const dock = leaf === null ? undefined : docks.dockOf(leaf);
      if (dock === undefined) return false;
      if (!checking) dock.toggle(false);
      return true;
    });
    this.command('copy-online-table-link', (checking) => {
      const link = this.online.link();
      if (link === null) return false;
      if (!checking) void copyText(activeDocument.body, link).then((copied) => showNotice(copied ? 'Join link copied.' : 'The link could not be copied.'));
      return true;
    });
    this.command('make-selected-player-tokens', (checking) => this.markSelected(checking, true));
    this.command('make-selected-gm-tokens', (checking) => this.markSelected(checking, false));
    this.command('stop-online-table', (checking) => {
      if (this.table === null) return false;
      if (!checking) this.online.stop();
      return true;
    });
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      this.table?.checkLeaf();
      docks.sync();
      logs.sync();
    }));
  }

  onunload(): void {
    this.live = false;
    this.docks?.dispose();
    this.docks = null;
    this.logs?.dispose();
    this.logs = null;
    // A change of the log or of a book that still waits to be saved is saved now.
    if (this.logSave !== null) void this.saveSettings();
    // Unloading closes the connection only: the table stays on the server and comes back on the next load.
    this.online.close();
    stopCompanionTimers();
  }

  /** Saves the settings with the table's players, token owners and player tokens, its log and the players' books. */
  async saveSettings(): Promise<void> {
    if (this.logSave !== null) companionTimers().clearTimer(this.logSave);
    this.logSave = null;
    await this.data.write({ ...this.settings, ownership: this.online.ownership.toData(), table: this.savedTable, ...(this.savedLog !== undefined && { tableLog: this.savedLog }), books: this.books.toData() });
  }

  /** What one of online play's commands does; the plugin registers the commands once (`registerOnlinePlay`). */
  private command(id: OnlineCommandId, check: (checking: boolean) => boolean): void {
    this.commands.set(id, check);
  }

  /** Keeps the table's log: a cleared one at once, a changed one within `LOG_SAVE_MS` (every message would write the data file). */
  private keepLog(log: object | null): void {
    const cleared = log === null;
    if (cleared && this.savedLog === undefined) return;
    this.savedLog = cleared ? undefined : log;
    if (cleared) return void this.saveSettings();
    this.saveSoon();
  }

  /** Writes the data file within `LOG_SAVE_MS`: every message or note would write it otherwise. */
  private saveSoon(): void {
    this.logSave ??= companionTimers().setTimer(() => void this.saveSettings(), LOG_SAVE_MS);
  }

  /** Makes the tokens selected on the active Atlas tab player tokens, or the GM's own. */
  private markSelected(checking: boolean, player: boolean): boolean {
    if (activeAtlasLeaf(this.app) === null) return false;
    if (checking) return true;
    const count = this.online.markSelected(player);
    if (count === 0) showNotice('Select tokens on the map first.');
    else showNotice(player ? `Player tokens: ${tokensText(count)}. Assign each to a player in the online panel.` : `${tokensText(count)} now belong to the GM.`);
    return true;
  }
}
