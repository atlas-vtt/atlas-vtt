import { type App, type WorkspaceLeaf } from 'obsidian';
import { showNotice } from '../../ui/notice';
import { activeAtlasLeaf, activeStore, sceneStoreOf, selectedTokenIds, workScene, type WorkScene } from './atlasView.ts';
import type { CampaignPlayer } from '../../campaigns/players/playersFile';
import { BookShelf } from './book/BookShelf.ts';
import { CAMPAIGNS_LOADING_TEXT, linkRefusal, NO_CAMPAIGN_TEXT, NO_TABLE_TEXT, renewLink, type TableSeats } from './campaignSeats.ts';
import { GM_LEVEL } from '../protocol/index.ts';
import { isOutdated, rememberMinLevel } from './gmLevel.ts';
import { freeGate, newGate } from './joinGate.ts';
import { LogKeeper, type LogStore } from './log/logStore.ts';
import { OnlineTable } from './OnlineTable.ts';
import type { KnownPlayer, Ownership } from './ownership.ts';
import { giveTokens, markTokens, playerTokenRows, type PlayerTokenRow } from './playerTokenRows.ts';
import { presentOnPlayerView, presentedSceneSource, showPresentedElsewhere, type ShownElsewhere } from './presentedScene.ts';
import type { SavedTable } from './savedTable.ts';
import { RELAY_ORIGIN } from './servers.ts';
import type { TableCampaigns } from './tableCampaigns.ts';
import { createCampaignTable, NO_ACCOUNT, refused, startBlock, type HostAccount } from './tableStart.ts';
import type { TableStatus } from './TableConnection.ts';
import type { LostTable } from './tableEnd.ts';

/**
 * The GM's side of online play, free of any panel: start and stop a table of a campaign, which this
 * device plays exactly while the table runs or comes back after a reload, its link and status, the
 * campaign's players (list, add, rename, new code, kick, remove), and the scene's player tokens
 * (list with owners, mark and unmark, give to a player, take back). Panels and commands call this
 * and redraw on `onChange`.
 */
export class OnlineControl {
  private readonly app: App;
  readonly ownership: Ownership;
  /** Keeps the running table in the companion's data (null: none runs), so a reload comes back to it. */
  private readonly save: (table: SavedTable | null) => void;
  private current: OnlineTable | null = null;
  private saved: SavedTable | null = null;
  private starting = false;
  /** Counts the times the control was closed, so a start or resume that waited across one runs no table. */
  private closings = 0;
  private ended: LostTable | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly account: HostAccount;
  /** Atlas told that players see its presented scene online, while a table runs. */
  private shown: ShownElsewhere | null = null;
  /** Stops following what is played, which only matters while a table runs. */
  private unwatch = (): void => undefined;
  /** The running table's log, kept with it and told to its panels. */
  readonly logs: LogKeeper;

  constructor(app: App, ownership: Ownership, private readonly campaigns: TableCampaigns, save: (table: SavedTable | null) => void = () => undefined, account: HostAccount = NO_ACCOUNT, logStore?: LogStore, private readonly shelf = new BookShelf()) {
    this.app = app;
    this.ownership = ownership;
    this.save = save;
    this.logs = new LogKeeper(logStore);
    this.account = account;
    ownership.onChange(() => this.changed());
  }

  /** Calls the listener after every change of the table, its players or the player tokens; returns the way to stop. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The running table, or null. */
  get table(): OnlineTable | null {
    return this.current;
  }

  /** The table's status, or null while none runs. */
  status(): TableStatus | null {
    return this.current?.status ?? null;
  }

  /** The join link of the running table, or null. */
  link(): string | null {
    return this.current?.link ?? null;
  }

  /** The id of the campaign the running table plays; null while none runs. */
  campaignId(): string | null {
    return this.current === null ? null : this.saved?.campaignId ?? null;
  }

  /** The players the running table seats, or null while none runs. */
  seats(): number | null {
    return this.current === null ? null : this.saved?.maxPlayers ?? null;
  }

  /** Whether a table is being created on the server. */
  isStarting(): boolean {
    return this.starting;
  }

  /** How the last table ended, if the server ended it and not the GM; null otherwise. Cleared by the next start. */
  lost(): LostTable | null {
    return this.ended;
  }

  /** Whether the relay asked for a newer Atlas than this one, the last time it said. */
  outdated(): boolean {
    return isOutdated(this.app);
  }

  /** Whether the running table's relay needs a newer Atlas than this one: it let it in because players sit at the table. */
  updateAfterSession(): boolean {
    return (this.current?.minLevel ?? 0) > GM_LEVEL;
  }

  /** Whether a table can be started now: none runs or is starting, and an Atlas tab is active. */
  canStart(): boolean {
    return this.current === null && !this.starting && activeAtlasLeaf(this.app) !== null;
  }

  /**
   * Starts a table of the campaign `campaignId` from the Atlas tab `leaf`, on the campaign's lasting
   * link; tells the GM with a notice why it cannot. Once it runs, this device plays that campaign
   * until the table ends. Players see the scene Atlas presents to its player view.
   */
  start(leaf: WorkspaceLeaf | null, campaignId: string | null): Promise<OnlineTable | null> {
    return this.startFor(leaf, campaignId);
  }

  /**
   * Comes back to a table saved before a reload: same link and host secret, the campaign it was
   * started for and that campaign's players, once its players file was read; players see the scene
   * Atlas presents again. The campaign stays played while it comes back, and is played no longer
   * where its players cannot be read.
   */
  async resume(saved: SavedTable): Promise<OnlineTable | null> {
    if (this.current !== null || this.starting) return this.current;
    this.starting = true;
    const closings = this.closings;
    const seats = await this.campaigns.open(saved.campaignId).catch(() => null).finally(() => (this.starting = false));
    if (closings !== this.closings || this.current !== null) return this.current;
    if (seats === null) {
      this.campaigns.stop();
      return null;
    }
    return this.run(saved, seats, this.logs.saved());
  }

  /** Ends the running table for good: the link stops working, the saved table is forgotten and its campaign is played no longer. */
  stop(): void {
    this.end();
    this.campaigns.stop();
  }

  /** Closes the running table's connection for a reload, keeping it on the server and in the saved data. */
  close(): void {
    this.closings += 1;
    const table = this.current;
    this.current = null;
    table?.close();
    this.unbind();
    this.syncShown();
  }

  /** Shows the active scene of this Atlas tab on Atlas's player view, which players online see too. */
  share(leaf: WorkspaceLeaf): void {
    if (!presentOnPlayerView(this.app, leaf)) showNotice('Atlas cannot show this map on the player view.');
  }

  /** Every player of the running table's campaign: those online first, then by name. */
  players(): KnownPlayer[] {
    return this.ownership.list();
  }

  /** Takes a player off the running table: their key for it stops working; they come back with their own code. */
  kick(playerId: string): void {
    this.current?.kick(playerId);
  }

  /** A player's own code in the running table's campaign, else in the played one; null for anyone it does not know. */
  playerCode(playerId: string): string | null {
    const playing = this.campaigns.playing();
    const seats = this.current?.roster.seats ?? (playing === null ? null : this.campaigns.known(playing));
    return seats?.codeOf(playerId) ?? null;
  }

  /** Gives a player a new code: the old one stops working at once, and a connected player stays. */
  newPlayerCode(playerId: string): void {
    this.current?.roster.newCode(playerId);
  }

  /** Adds a player the GM names to the running table's campaign; null where it cannot (the GM is told why). */
  addPlayer(name: string): CampaignPlayer | null {
    return this.current?.roster.add(name) ?? null;
  }

  renamePlayer(playerId: string, name: string): void {
    this.current?.roster.rename(playerId, name);
  }

  /** Removes a player from the campaign: their code stops working and they leave the table; their characters are nobody's. */
  removeFromCampaign(playerId: string): void {
    this.current?.roster.remove(playerId);
  }

  /**
   * Gives the campaign a new link, so the old one stops working; a running table starts again on it.
   * Where it could not start again (no Atlas tab, signed out) nothing changes and the GM is told why.
   */
  async newLink(): Promise<void> {
    const campaignId = this.saved?.campaignId ?? this.campaigns.playing();
    const leaf = this.current?.sharedTab ?? activeAtlasLeaf(this.app);
    const blocked = this.current === null ? null : startBlock(leaf, campaignId, this.account);
    if (blocked !== null) return void showNotice(blocked);
    if (campaignId === null) return void showNotice(NO_CAMPAIGN_TEXT);
    const seats = await this.campaigns.open(campaignId).catch(() => null);
    if (seats === null || !renewLink(seats)) return void showNotice(seats === null ? CAMPAIGNS_LOADING_TEXT : linkRefusal(seats));
    if (this.current === null) return;
    // The campaign stays played across the restart, unless no table runs after it.
    this.end();
    let restarted: OnlineTable | null = null;
    try {
      restarted = await this.startFor(leaf, campaignId);
    } finally {
      if (restarted === null) this.campaigns.stop();
    }
  }

  /** The player tokens of the shared scene as players see it (of the active Atlas tab while none is shared), with who has each. */
  playerTokens(): PlayerTokenRow[] {
    return playerTokenRows(this.ownership, this.sharedScene());
  }

  /** The tokens selected on the active Atlas tab (the shared one when none is active). */
  selectedTokens(): string[] {
    const scene = this.activeScene();
    return scene === null ? [] : selectedTokenIds(scene.store.getState());
  }

  /** Makes tokens of the shared scene player tokens, or the GM's own (which takes them back from their players). */
  markPlayerTokens(tokenIds: readonly string[], player: boolean): void {
    if (this.canMark()) markTokens(this.ownership, this.sharedScene(), tokenIds, player);
  }

  /** Makes the tokens selected on the active Atlas tab player tokens, or the GM's own; the number of tokens changed, null where no campaign keeps them. */
  markSelected(player: boolean): number | null {
    const scene = this.activeScene();
    const selected = scene === null ? [] : selectedTokenIds(scene.store.getState());
    if (selected.length > 0 && !this.canMark()) return null;
    markTokens(this.ownership, scene, selected, player);
    return selected.length;
  }

  /** Whether player tokens can be kept now; where not, the GM is told why. Player tokens are the campaign's, so none are kept while no table plays one. */
  private canMark(): boolean {
    if (this.ownership.canMark()) return true;
    showNotice(this.campaigns.playing() === null ? NO_TABLE_TEXT : CAMPAIGNS_LOADING_TEXT);
    return false;
  }

  /** Gives tokens to a player, or takes them back from whoever has them (null). A token nobody had sees from then on (`seeAsPlayers`). */
  give(tokenIds: readonly string[], playerId: string | null): void {
    giveTokens(this.ownership, this.sharedScene(), tokenIds, playerId);
  }

  private sharedScene(): WorkScene | null {
    return workScene(this.current?.sharedStore ?? activeStore(this.app));
  }

  private activeScene(): WorkScene | null {
    const shared = this.current?.sharedTab;
    return workScene(activeStore(this.app) ?? (shared === null || shared === undefined ? null : sceneStoreOf(shared)));
  }

  private async startFor(leaf: WorkspaceLeaf | null, campaignId: string | null): Promise<OnlineTable | null> {
    if (this.current !== null || this.starting) return this.current;
    const blocked = startBlock(leaf, campaignId, this.account);
    const token = this.account.token();
    if (blocked !== null || leaf === null || campaignId === null || token === null) return refused(blocked ?? NO_CAMPAIGN_TEXT);
    this.starting = true;
    this.changed();
    const closings = this.closings;
    const made = await createCampaignTable(this.campaigns, campaignId, token, this.account, (level) => rememberMinLevel(this.app, level)).finally(() => (this.starting = false));
    this.changed();
    if (made === null || closings !== this.closings) return null;
    // A new table's log is empty: the last table's goes.
    this.logs.forget();
    const mapPath = sceneStoreOf(leaf)?.getState().mapPath ?? null;
    return this.run({ ...made.created, campaignId, mapPath, gate: newGate(undefined, made.seats.codes()) }, made.seats);
  }

  /** Runs the table on its campaign: its players and books are the campaign's from before anyone can join until it ends. */
  private run(given: SavedTable, seats: TableSeats, savedLog?: unknown): OnlineTable {
    // A join code that is now a player's own (made on another device since) is made anew: the page's one field takes both.
    const saved = { ...given, gate: freeGate(given.gate, seats.codes()) };
    this.ended = null;
    this.keep(saved);
    this.ownership.bind(seats);
    this.campaigns.bound(saved.campaignId);
    const table = new OnlineTable(this.app, RELAY_ORIGIN, saved, saved.mapPath, this.ownership, seats, saved.gate, {
      status: () => {
        // A welcome says what the relay needs now; an older relay names nothing and needs nothing.
        if (table.status === 'online') rememberMinLevel(this.app, table.minLevel ?? 0);
        this.changed();
      },
      gate: (gate) => {
        if (this.current === table && this.saved !== null) this.keep({ ...this.saved, gate });
      },
      changed: () => this.changed(),
      log: () => void (this.current === table && this.logs.keep(table.log.saved())),
      mapPath: (mapPath) => {
        if (this.current === table && this.saved !== null) this.keep({ ...this.saved, mapPath });
      },
      ended: (end) => {
        if (this.current !== table) return;
        this.current = null;
        this.unbind();
        this.syncShown();
        // Whoever ends a table themselves decides what is played next (`stop`, `newLink`); a table the server closed, or another Obsidian took over, ends the play here.
        if (end !== 'stopped') this.campaigns.stop();
        // A table the server ended is gone; one the GM stopped was dropped by `stop`, one another Obsidian took over lives on there, and one that waits for an updated Atlas stays.
        this.ended = end === 'stopped' || end === 'replaced' || end === 'outdated' ? null : end;
        if (end === 'outdated') rememberMinLevel(this.app, GM_LEVEL + 1);
        if (this.ended !== null) this.keep(null);
        // The account page says why; the dock shows what the relay says of the account now.
        if (end === 'no-access') void this.account.refresh(true);
      },
    }, this.shelf, savedLog);
    // The table's campaign is the one played while it runs: its rules, quests and world map are what players get.
    this.campaigns.play(saved.campaignId);
    // A campaign deleted while its table runs is played no longer (`recordCampaignPlay`, the campaign page), and takes its table with it.
    this.unwatch = this.campaigns.onChange(() => {
      if (this.current === table && this.campaigns.playing() !== saved.campaignId) this.stop();
    });
    this.current = table;
    table.start();
    this.changed();
    return table;
  }

  /** Ends the running table on the server and forgets the saved one; what is played stays as it is. */
  private end(): void {
    this.current?.end();
    this.keep(null);
  }

  /** No table runs: nobody plays, and the books stay in memory. */
  private unbind(): void {
    this.unwatch();
    this.unwatch = (): void => undefined;
    this.ownership.bind(null);
    this.campaigns.bound(null);
  }

  private keep(saved: SavedTable | null): void {
    if (saved === null && this.saved === null) return;
    this.saved = saved;
    this.save(saved);
    // The log goes with its table.
    if (saved === null) this.logs.forget();
  }

  private changed(): void {
    this.syncShown();
    for (const listener of this.listeners) listener();
    this.logs.changed();
  }

  /**
   * Keeps Atlas told that players see its presented scene online for as long as a table runs, so
   * the eye on a scene tab moves the table instead of opening the local player window. A reloaded
   * Atlas has a presented scene of its own, which is told again at the next change.
   */
  private syncShown(): void {
    const source = this.current === null ? null : presentedSceneSource(this.app);
    if (this.shown !== null && this.shown.source !== source) {
      this.shown.stop();
      this.shown = null;
    }
    if (this.current !== null && this.shown === null) this.shown = showPresentedElsewhere(this.app);
  }
}
