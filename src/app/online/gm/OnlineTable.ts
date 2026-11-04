import type { ConnectionStats } from '../protocol/index.ts';
import type { App, WorkspaceLeaf } from 'obsidian';
import { showNotice } from '../../ui/notice';
import { randomHex } from '../../utils/randomHex';
import { ArmedCards } from './armedCards.ts';
import { ATLAS_VIEW_TYPE, type SceneStore } from './atlasView.ts';
import type { BookRests } from './book/bookRests.ts';
import type { BookShelf } from './book/BookShelf.ts';
import { gatedRests } from './book/restGate.ts';
import type { TableSeats } from './campaignSeats.ts';
import { tableBook, type TableBook } from './book/tableBook.ts';
import { companionTimers, every } from './companionTimers.ts';
import type { CreatedTable } from './createdTable.ts';
import { ImageShare } from './image/ImageShare.ts';
import { PAUSED_TEXT, TableGate, type GateSettings } from './joinGate.ts';
import { gmRoll, type GmRollDraft, type GmRollRefusal } from './log/gmRolls.ts';
import { restChangeOwners, restRecordOf } from './log/restEntry.ts';
import { TableLog } from './log/TableLog.ts';
import type { Ownership } from './ownership.ts';
import { presentedScene, presentedSceneSource } from './presentedScene.ts';
import { bindScene, type SceneBinding } from './sceneBinding.ts';
import { TabWatch } from './sharedTab.ts';
import { CoveredPages } from './coveredPages.ts';
import { TableConnection, type TableStatus } from './TableConnection.ts';
import { TableRoster } from './tableRoster.ts';
import { closingText, tableEndOf, tableEndText, type TableEnd } from './tableEnd.ts';
import { readVaultImage } from './vaultImage.ts';
import { LOST_NOTICES, type OnlineTableEvents } from './tableEvents.ts';
import type { AssetPublisher } from './assets/AssetPublisher.ts';
import { OpenScenes, tablePublisher, viewFocus, type TableAssets } from './assets/tableAssets.ts';

export type { OnlineTableEvents };
import { FoundShare } from './pins/FoundShare.ts';

/** How often the presented tab is looked for, and the shared one checked. */
const WATCH_MS = 1_000;

/**
 * One running table: the socket, the join link, and the scene Atlas presents to its player view (the eye
 * on a scene tab), followed through Atlas's lifecycle (`TabWatch`). Players never follow the GM's own tab
 * switches: while the GM works on another scene tab they keep what they saw. While the presented tab is
 * gone (Atlas reloads, the tab was closed) or Atlas presents nothing, players are sent no scene; once a
 * view shows the presented scene it is shared.
 */
export class OnlineTable {
  private readonly app: App;
  private readonly connection: TableConnection;
  private readonly watch: TabWatch<SceneBinding>;
  private stopWatchTimer: () => void = () => undefined;
  private stopFollowingPresented: () => void = () => undefined;
  private stopLoggingRests: () => void = () => undefined;
  private currentStatus: TableStatus = 'connecting';
  private closing: number | null = null;
  /** The closing time the GM was last told with a notice: a reconnect names the same one again. */
  private toldClosing: number | null = null;
  private readonly events: OnlineTableEvents;
  readonly ownership: Ownership;
  /** The arming clock of the cards over the control: newcomers who knock, and players who ask for a rest. */
  private readonly cards: ArmedCards;
  /** The table's gates: the join code, the two switches, and who waits for an answer. */
  readonly gate: TableGate;
  /** The players of the campaign the table runs on. */
  readonly roster: TableRoster;
  /** The table's log: chat, rolls, who came and went. */
  readonly log: TableLog;
  /** The image the GM shows every player over the map, while one is shown. */
  readonly image: ImageShare;
  /** The players' books: each one's own pages besides the table, kept on this device's shelf. */
  private readonly books: TableBook;
  /** The readable pins players find, and the notes they found. */
  private readonly found: FoundShare;
  /** The pages whose book covers their map, which the table's activity leaves out. */
  private readonly covers: CoveredPages;
  /** Keeps what players are shown in the asset store, while the account can; null where it cannot. */
  private readonly assets: AssetPublisher | null;
  /** The scenes open in Atlas's tabs, offered to the store ahead of their turn. */
  private readonly openScenes: OpenScenes | null;
  /** The join link players open. */
  readonly link: string;
  private readonly stopOwnership: () => void;

  constructor(app: App, origin: string, table: CreatedTable, mapPath: string | null, ownership: Ownership, seats: TableSeats, gate: GateSettings, events: OnlineTableEvents, shelf: BookShelf, savedLog?: unknown, assets?: TableAssets) {
    this.app = app;
    this.ownership = ownership;
    this.events = events;
    this.link = `${origin}/#${table.code}`;
    this.cards = new ArmedCards(companionTimers());
    this.gate = new TableGate(gate, {
      send: (frame) => this.connection.sendGate(frame),
      answer: (id, admit) => this.connection.answer(id, admit),
      save: (settings) => events.gate(settings),
      changed: () => events.changed(),
      paused: () => showNotice(PAUSED_TEXT),
      timers: companionTimers(),
      taken: () => seats.codes(),
      cards: this.cards,
    });
    const timers = companionTimers();
    this.assets = assets === undefined ? null : tablePublisher({
      app, origin, assets, timers,
      send: (body, to) => this.connection.send(body, to),
      sendLive: (body, key, to) => this.connection.sendLive(body, key, to),
      connection: () => ({ players: this.connection.connected.size, latencyMs: this.connection.stats().latencyMs }),
      connected: () => [...this.connection.connected],
      withdrawn: () => this.refreshAssets(),
      focus: () => viewFocus(this.watch.current?.renderer),
    });
    this.openScenes = this.assets === null ? null : new OpenScenes(app, this.assets.storing);
    const stored = this.assets?.storing;
    this.log = new TableLog({
      send: (body, to) => this.connection.send(body, to),
      clock: () => Date.now(),
      now: () => timers.now(),
      randomId: () => randomHex(12),
      nameOf: (player) => ownership.nameOf(player),
      setTimer: (run, ms) => timers.setTimer(run, ms),
      clearTimer: (timer) => timers.clearTimer(timer),
      changed: () => events.log(),
      speaker: (who, key) => this.bound()?.share.dice.speaker(who, key) ?? Promise.resolve(null),
      rollInline: (formula) => this.bound()?.share.dice.quietRoll(formula) ?? null,
    }, savedLog);
    this.image = new ImageShare({
      send: (body, to) => this.connection.send(body, to),
      now: () => timers.now(),
      randomId: () => randomHex(12),
      changed: () => events.changed(),
      logShown: (shown, path) => this.log.imageShown(shown, path),
      stored,
    });
    this.found = new FoundShare(this.log, {
      app, send: (body, to) => this.connection.send(body, to), now: () => timers.now(), nameOf: (player) => ownership.nameOf(player),
      layers: () => this.bound()?.share.layers ?? null, stored,
    });
    this.books = tableBook({
      app, shelf, ownership, randomId: () => randomHex(12),
      send: (body, to) => this.connection.send(body, to),
      scene: () => this.bound()?.book() ?? null,
      readImage: (path) => readVaultImage(app, path),
      stored,
      tokenWrites: () => this.bound()?.resources ?? null,
      cards: this.cards,
      cardsChanged: () => events.changed(),
    });
    this.covers = new CoveredPages({
      // Each method by itself: the timers are a class, whose methods a spread leaves behind
      now: () => timers.now(),
      setTimer: (run, ms) => timers.setTimer(run, ms),
      clearTimer: (timer) => timers.clearTimer(timer),
      sendLive: (body, key, to) => this.connection.sendLive(body, key, to),
      batches: () => this.connection.batches,
      connected: () => this.connection.connected,
      uncovered: (player) => this.bound()?.share.catchUpMarks(player),
    });
    this.watch = new TabWatch<SceneBinding>({
      leaves: () => app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE),
      presented: () => presentedScene(app),
      bind: (tab, presented) => bindScene({
        app,
        seats: ownership,
        send: (body, to) => this.connection.send(body, to),
        sendLive: (body, key, to) => this.covers.sendLive(body, key, to),
        readImage: (path) => readVaultImage(app, path),
        stored,
        isLive: (binding) => this.watch.isLive(binding),
        randomId: () => randomHex(12),
        logRoll: (roll) => this.log.rolled(roll),
        rollRequest: (from, answer) => this.log.requestOf(from, answer),
        foundPin: (map, pin) => this.found.entryOf(map, pin),
        nameOf: (player) => ownership.nameOf(player),
      }, tab, presented),
      lost: (reason) => {
        this.withdraw();
        const notice = LOST_NOTICES[reason];
        if (notice !== null) showNotice(notice);
      },
      mapPath: (path) => events.mapPath(path),
    }, mapPath);
    this.connection = new TableConnection(origin, table.code, table.secret, {
      status: (status) => this.setStatus(status),
      // The scene and tokens first: the players' mine messages follow from the ownership change.
      welcome: (connected) => {
        // Who joined while the GM was away is seated as one who joins now; who came or went is in the log before it goes out again.
        const players = connected.filter((player) => this.roster.joined(player));
        this.log.welcome(players);
        // Pages say again with the books that follow whether theirs covers the map.
        this.covers.reset();
        this.assets?.welcome();
        this.resend();
        ownership.welcome(players);
      },
      joined: (player) => {
        if (!this.roster.joined(player)) return;
        // The log as it was, then the line that they joined, which everyone gets.
        this.resend(player.id);
        ownership.joined(player);
        this.log.joined(player);
      },
      left: (player) => {
        this.covers.playerLeft(player);
        this.bound()?.share.playerLeft(player);
        this.books.share.playerLeft(player);
        this.assets?.playerLeft(player);
        ownership.left(player);
        this.log.left(player);
      },
      // The log, the found pins and the books are the table's, so they hear players while no scene is shared too.
      message: (from, body) => void (this.bound()?.share.heard(from, body), this.covers.receive(from, body) || this.log.receive(from, body) || this.found.receive(from, body) || this.books.share.receive(from, body) || this.bound()?.share.receive(from, body)),
      access: (closesAt) => this.setClosing(closesAt),
    }, this.gate);
    // Each player hears only how far the assets they were sent references of have come.
    this.connection.onSent = (text, to) => this.assets?.sent(text, to);
    this.roster = new TableRoster(seats, this.connection, { kick: (player) => this.kick(player), turnAway: (player) => this.connection.kick(player), joinCode: () => this.gate.settings.code });
    this.stopOwnership = ownership.onChange(() => this.bound()?.share.ownersChanged());
  }

  /** The players' rest requests waiting for the GM, and the GM's answers to them. */
  get rests(): BookRests {
    return this.books.share.rests;
  }

  /** The keys of the cards over the control, newcomers' and rest requests', in the order they came. */
  cardOrder(): readonly string[] {
    return this.cards.keys();
  }

  /** The Atlas tab players see live: bound, and showing the presented scene now; null while there is none. */
  get sharedTab(): WorkspaceLeaf | null {
    const binding = this.watch.binding;
    return binding?.showing === true ? this.watch.current?.leaf ?? null : null;
  }

  /** The shared scene's store as players see it (frozen while the GM works on another tab), or null while none is shared. */
  get sharedStore(): SceneStore | null {
    return this.watch.binding?.store ?? null;
  }

  /** The name of the scene tab Atlas presents, or null while it presents none of the open tabs. */
  get presentedName(): string | null {
    return this.watch.presented?.name ?? null;
  }

  get status(): TableStatus {
    return this.currentStatus;
  }

  /** When the relay closes the table because its account may no longer host (the relay's clock), or null. */
  get closesAt(): number | null {
    return this.closing;
  }

  /** The least GM level the relay's player page needs, as its last welcome said; null while it said none. */
  get minLevel(): number | null {
    return this.connection.minLevel;
  }

  /** How the table's connection went, for feedback's diagnostics. */
  connectionStats(): ConnectionStats {
    return this.connection.stats();
  }

  /** A GM's roll from the log (its composer, a roll button, another plugin), on the shared scene's dice. */
  rollFromLog(draft: GmRollDraft): Promise<GmRollRefusal | null> {
    const binding = this.bound();
    return gmRoll(draft, this.log, binding?.share.dice ?? null, binding?.store ?? null);
  }

  /** Removes a player: their key stops working, their browser leaves the table and their tokens are nobody's. */
  kick(player: string): void {
    this.roster.kicked(player);
    this.connection.kick(player);
    this.ownership.remove(player);
  }

  start(): void {
    this.roster.start();
    this.connection.start();
    this.books.start();
    this.found.start();
    // Every rest that reaches a character of this table the GM's Atlas takes while it runs is logged: approved requests and the GM's own.
    this.stopLoggingRests = gatedRests.onRested((rest) => {
      const players = this.playersOfCharacter(rest.characterId);
      const changePlayers = restChangeOwners(rest).map((id) => (id === rest.characterId ? [] : this.playersOfCharacter(id)));
      if (players.length > 0 || changePlayers.some((list) => list.length > 0)) this.log.rested(restRecordOf(rest), players, changePlayers);
    });
    this.check();
    this.stopWatchTimer = every(companionTimers(), WATCH_MS, () => this.check());
    // Atlas presenting another scene is followed at once; the timer catches everything else
    this.stopFollowingPresented = presentedSceneSource(this.app)?.onChange(() => this.watch.check()) ?? ((): void => undefined);
  }

  /** Looks at the presented and the shared tab again (the workspace's layout changed). */
  checkLeaf(): void {
    this.watch.check();
  }

  /** The account signs out: nothing more goes into the store from this table. */
  suspendAssets(): void {
    this.assets?.suspend();
  }

  /** The GM signed in again: what waits for the store is offered again. */
  signedIn(): void {
    this.assets?.signedIn();
  }

  /** Ends the table on the server and stops sharing. */
  end(): void {
    this.stopWatch();
    this.connection.end();
  }

  /** Closes the socket and stops sharing, leaving the table on the server: a reload comes back to it. */
  close(): void {
    this.stopWatch();
    this.connection.stop();
  }

  /** The players of a character (a library token's id): the campaign's player it was given to, and whoever plays it at the table now. */
  private playersOfCharacter(characterId: string): string[] {
    const owner = this.ownership.ownerOfCharacter(characterId);
    return [...new Set([...(owner === undefined ? [] : [owner]), ...this.books.share.playersOf(characterId)])];
  }

  private setStatus(status: TableStatus): void {
    this.currentStatus = status;
    if (status === 'stopped') this.finish('stopped');
    else if (status === 'refused') {
      const end = tableEndOf(this.connection.closeCode);
      showNotice(tableEndText(end));
      this.finish(end);
    }
    this.events.status(status);
  }

  private finish(end: 'stopped' | TableEnd): void {
    this.stopWatch();
    this.stopOwnership();
    this.roster.dispose();
    this.gate.dispose();
    this.log.dispose();
    this.books.stop();
    this.cards.dispose();
    this.covers.reset();
    this.assets?.stop();
    this.closing = null;
    this.events.ended(end);
  }

  /** The relay named when the table closes for want of access, or took it back; the GM is told once per time, also while the control is closed. */
  private setClosing(closesAt: number | null): void {
    if (closesAt === this.closing) return;
    this.closing = closesAt;
    if (closesAt !== null && closesAt !== this.toldClosing) {
      this.toldClosing = closesAt;
      showNotice(closingText(closesAt));
    }
    this.events.changed();
  }

  /** Follows what Atlas presents, and offers the scenes open beside it. */
  private check(): void {
    this.watch.check();
    this.openScenes?.check(this.app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE), this.watch.mapPath);
  }

  /** Assets players were handed may no longer be stored: the shares read them again, and what the store will not keep is taken from players. */
  private refreshAssets(): void {
    this.bound()?.share.refreshAssets();
    void this.image.refreshAssets();
    this.books.refreshAssets();
    this.found.refreshAssets();
  }

  private stopWatch(): void {
    this.assets?.stop();
    this.stopLoggingRests();
    this.found.stop();
    this.stopWatchTimer();
    this.stopFollowingPresented();
    this.watch.stop();
  }

  /** The binding of the tab shared now, while it is still the same tab; null while there is none. */
  private bound(): SceneBinding | null {
    const binding = this.watch.binding;
    return binding !== null && this.watch.isLive(binding) ? binding : null;
  }

  /** The scene, tokens and the rest to one player or to all, or no scene while the shared tab is gone; then the log, the shown image and the books. */
  private resend(to?: string): void {
    const binding = this.bound();
    if (binding === null) this.connection.send({ t: 'scene', scene: null }, to);
    else binding.share.resend(to);
    this.log.resend(to);
    this.image.resend(to);
    this.books.share.resend(to);
    this.assets?.resend(to);
  }

  /** Players see no scene while the shared tab is gone, so nothing of what they saw lingers or moves. */
  private withdraw(): void {
    this.connection.send({ t: 'scene', scene: null });
  }
}
