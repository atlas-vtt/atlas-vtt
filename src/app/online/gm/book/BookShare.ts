import { isPlayerBookType, isRecord, parseBookTokenMessage, parsePlayerBookMessage, type BookQuest, type BookResourceMessage, type PlayerBook } from '../../protocol/index.ts';
import type { LootRecipient, LootRecipientSource } from '../../../loot/lootRecipients';
import type { LootDraw } from '../../../loot/lootRoller';
import { ArtRefs } from '../artRefs.ts';
import { every } from '../companionTimers.ts';
import { MoveRate } from '../moveCheck.ts';
import { AskedAnswer } from './askedAnswer.ts';
import { BookAssetDesk } from './bookAssetDesk.ts';
import type { NamedAssets } from './bookAssets.ts';
import { bookItemOf } from './bookItem.ts';
import type { BookShelf } from './BookShelf.ts';
import { sheetOf } from './bookSheet.ts';
import { applyBookMessage, EMPTY_BOOK, withItem } from './bookStore.ts';
import { Characters, type PlayedCharacter } from './characters.ts';
import type { DrawnStatblock } from './statblockSheet.ts';
import { QuestPlaces } from './questPlaces.ts';
import { RecipientListeners } from './recipientListeners.ts';
import type { BookScene } from './bookScene.ts';
import type { BookSharePorts } from './bookSharePorts.ts';
import { checkResourceEdit } from './resourceEdit.ts';
import { OwedBooks } from './owedBooks.ts';
import { bookUpdate, NO_QUESTS, RESEND, sentOf, type SentBook } from './sentBook.ts';
import { StatblockShare } from './statblockShare.ts';
import { WorldMaps, type WorldMapFile } from './worldMap.ts';

export type { BookSharePorts } from './bookSharePorts.ts';
export { REFUSAL_BOOK_MS } from './owedBooks.ts';

/** How often the scene is read again: a sheet follows its token within this time, however often the store changes. */
export const BOOK_POLL_MS = 400;
/** What a player may write into their book: a burst of `BOOK_BURST` edits, then `BOOK_WRITES_PER_SECOND`. */
export const BOOK_BURST = 30;
export const BOOK_WRITES_PER_SECOND = 2;

/** What a character without a name is called where the GM picks who gets an item. */
const UNNAMED = 'Unnamed character';

/**
 * The players' books: each connected player's own pages besides the table, sent to that player
 * alone and never to all. A book is its character's (`Characters`: the token the player acts
 * with, among their own): the sheet is read from the shared scene, items, notes, pins and purse
 * are kept on the shelf, the world map of the campaign being played and its quests (the GM's
 * quest notes, which no player writes) go to everyone at the table, with a character or without;
 * notes on a quest name it by its id. It is the table's, not a scene's, so it hears players while
 * no scene is shared. What a player writes is taken as the protocol's parser cleaned it, only for a
 * player with a character and within their rate, and is not answered; a refused write is answered
 * with the whole book (`OwedBooks`). A page that reads its book in parts (`book-parts`) gets a
 * changed world map or quests alone, any other the whole book again. A player changes their own
 * character's resources through Atlas (`editResource`), and the sheet that follows tells them what
 * was taken. A player
 * with a character whose note is a native statblock is sent it after their book, and again
 * whenever it changes (`StatblockShare`), and changes its values and abilities in the note. A
 * player is served by hash what their book names (`BookAssetDesk`), and nobody another character's
 * artwork or statblock.
 */
export class BookShare implements LootRecipientSource {
  private readonly ports: BookSharePorts;
  private readonly shelf: BookShelf;
  private readonly characters = new Characters();
  private readonly art: ArtRefs;
  private readonly maps: WorldMaps;
  private readonly questList: AskedAnswer<readonly BookQuest[]>;
  private readonly questPlaces = new QuestPlaces();
  private readonly assets: BookAssetDesk;
  private readonly statblocks: StatblockShare;
  private readonly rate = new MoveRate(BOOK_BURST, BOOK_WRITES_PER_SECOND);
  /** The world map as it was last known. */
  private worldMap: WorldMapFile | null = null;
  /** The quests as they were last known. */
  private quests: readonly BookQuest[] = NO_QUESTS;
  private mapPath: string | null = null;
  /** What each connected player was last sent. */
  private readonly sent = new Map<string, SentBook>();
  /** The players whose page reads its book in parts (`book-parts`): they get a changed world map or quests alone. */
  private readonly parts = new Set<string>();
  /** The whole books players are owed for writes of theirs that were refused. */
  private readonly owed: OwedBooks;
  private readonly listeners = new RecipientListeners();
  private stopPoll: (() => void) | null = null;

  constructor(ports: BookSharePorts, shelf: BookShelf) {
    this.ports = ports;
    this.shelf = shelf;
    this.art = new ArtRefs((path) => ports.readImage(path), () => this.update());
    this.maps = new WorldMaps({ stat: (path) => ports.stat(path), readImage: (path) => ports.readImage(path), source: () => ports.worldMap(), read: () => this.update() });
    this.owed = new OwedBooks(ports, (player) => this.sendBook(player));
    this.questList = new AskedAnswer(() => ports.quests(), NO_QUESTS, () => this.update());
    this.statblocks = new StatblockShare({
      read: (path) => ports.readStatblock(path), write: (path, patches) => ports.writeStatblock(path, patches), now: () => ports.now(),
      // What arrives once the table stopped is dropped: nothing more goes out.
      changed: () => this.whileRunning(() => this.update()),
      answered: (player) => this.whileRunning(() => this.resendStatblock(player)),
      owe: (player) => this.whileRunning(() => this.owed.owe(player)),
    });
    this.assets = new BookAssetDesk(ports, (player) => this.namedAssets(player));
  }

  start(): void {
    this.stopPoll ??= every(this.ports, BOOK_POLL_MS, () => this.update());
    this.update();
  }

  stop(): void {
    this.stopPoll?.();
    this.stopPoll = null;
    this.owed.stop();
  }

  /** The world map may be another now (the campaign played, its world map or that map's artwork changed): it is asked for anew. */
  worldMapChanged(): void {
    this.maps.forget();
    this.update();
  }

  /** The quests may be others now (the campaign played, a quest note written, added or gone): they are asked for anew. */
  questsChanged(): void {
    this.questList.forget();
    this.update();
  }

  /** A character's statblock note may read otherwise (every note for null, a template changed): it is read and drawn again. */
  statblockChanged(path: string | null): void {
    this.statblocks.changed(path);
    this.update();
  }

  /** Reads the scene again and sends each connected player what changed for them: the whole book, or the sheet alone. */
  update(): void {
    const map = this.maps.get();
    const quests = this.questList.get();
    // Being looked up or read: the books go out once both are known, with them.
    if (map === undefined || quests === undefined) return;
    this.worldMap = map;
    this.quests = this.questPlaces.of(quests, map?.questPlaces);
    const scene = this.ports.scene();
    const players = this.ports.players();
    if (scene !== null) this.read(scene, new Set(players.map((player) => player.id)));
    this.statblocks.retain(this.characters.statblockPaths());
    const online = new Set(players.filter((player) => player.online).map((player) => player.id));
    for (const player of [...this.sent.keys()]) if (!online.has(player)) this.sent.delete(player);
    for (const player of online) this.sync(player);
    this.tell();
  }

  /** The books again, to one player or to all; sent to all, their assets may be asked for again at once. */
  resend(to?: string): void {
    if (to === undefined) {
      this.sent.clear();
      this.assets.forget();
    } else this.sent.delete(to);
    this.update();
  }

  /** A player left the table: chunks queued for them are dropped, and they get their book anew when they are back. */
  playerLeft(player: string): void {
    this.assets.forget(player);
    this.sent.delete(player);
    this.statblocks.left(player);
    this.parts.delete(player);
  }

  /**
   * A player's message: true when it was the book's, so nobody else reads it. That is a write into
   * their book, the token their book follows, and a request for an asset only their book names
   * (their character's artwork while the scene does not show it, the world map).
   */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body)) return false;
    if (body.t === 'book-parts') {
      this.parts.add(from);
      return true;
    }
    if (body.t === 'asset-request') return this.assets.receive(from, body);
    if (body.t === 'book-token') return this.follow(from, body);
    if (!isPlayerBookType(body.t)) return false;
    if (!this.write(from, body)) this.owed.owe(from);
    return true;
  }

  recipients(): LootRecipient[] {
    return this.ports.players().filter((player) => player.online).map(({ id, name }) => {
      const character = this.characters.of(id);
      return { id, name, character: character === null ? null : character.sheet.name || UNNAMED };
    });
  }

  /** Hands a rolled item to a connected player's character: kept in its book and sent to that player alone. */
  give(recipientId: string, draw: LootDraw): boolean {
    const character = this.isOnline(recipientId) ? this.characters.of(recipientId) : null;
    const item = character === null ? null : bookItemOf(draw, this.ports.randomId(), this.ports.clock());
    if (character === null || item === null) return false;
    this.shelf.keep(character.collection, character.key, withItem(this.shelf.of(character.collection, character.key), item));
    this.ports.send({ t: 'book-item', item }, recipientId);
    return true;
  }

  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe(listener);
  }

  /** Who plays which character in the scene, with the artwork of a new scene read afresh. */
  private read(scene: BookScene, known: ReadonlySet<string>): void {
    if (scene.mapPath !== this.mapPath) this.art.clear();
    this.mapPath = scene.mapPath;
    this.characters.update(scene, {
      ownerOf: (tokenId) => this.ports.ownerOf(tokenId, scene.tokens[tokenId]),
      isKnown: (player) => known.has(player),
      sheet: (shown, token) => sheetOf(shown, token, scene.resources, (path) => this.art.get(path)),
      libraryStatblock: (placed) => this.ports.libraryStatblock(placed),
    });
  }

  /** A player chose the token they act with: their book follows it (`Characters.choose`), read at once while their writes are within their rate, else at the next poll. */
  private follow(from: string, body: Record<string, unknown>): boolean {
    const message = parseBookTokenMessage(body);
    const tokenId = message !== null && this.isOnline(from) ? this.ports.scene()?.listedToken(message.scene, message.token) : undefined;
    if (tokenId !== undefined && this.characters.choose(from, tokenId) && this.rate.take(from, this.ports.now())) this.update();
    return true;
  }

  /** Sends a player what changed of their book: the whole book for another character (or to a page that reads no parts), else each changed part alone. */
  private sync(player: string): void {
    const character = this.characters.of(player);
    const drawn = this.statblocks.of(character);
    const now = sentOf(character, this.worldMap, this.quests, drawn);
    const last = this.sent.get(player);
    const update = bookUpdate(last, now, this.parts.has(player));
    if (last === undefined || update === 'whole') return this.sendBook(player);
    // A statblock not drawn yet keeps what was sent; none after a book that went without one is what the page holds.
    const statblock = drawn !== undefined && last.statblock !== now.statblock && !(last.statblock === '' && drawn.statblock === null);
    if (update === null && !statblock) return;
    this.sent.set(player, { ...now, statblock: drawn === undefined ? last.statblock : now.statblock });
    if (update?.map === true) this.ports.send({ t: 'book-map', worldMap: this.worldMap?.map ?? null }, player);
    if (update?.quests === true) this.ports.send({ t: 'book-quests', quests: now.quests }, player);
    if (update?.sheet === true) this.ports.send({ t: 'book-sheet', character: character?.sheet ?? null }, player);
    if (statblock) this.sendStatblock(player, drawn);
  }

  /** The player's statblock, which their page holds until their next book. */
  private sendStatblock(player: string, drawn: DrawnStatblock): void {
    this.statblocks.sent(player, this.characters.of(player), drawn);
    this.ports.send({ t: 'book-statblock', statblock: drawn.statblock }, player);
  }

  /** A player's statblock edit was taken: they are sent their statblock again, also where it reads as before. */
  private resendStatblock(player: string): void {
    const last = this.sent.get(player);
    if (last !== undefined) this.sent.set(player, { ...last, statblock: RESEND });
    this.update();
  }

  private sendBook(player: string): void {
    this.owed.paying(player);
    if (!this.isOnline(player)) return;
    const character = this.characters.of(player);
    const { items, notes, pins, purse, slots, equipped } = character === null ? EMPTY_BOOK : this.shelf.of(character.collection, character.key);
    const drawn = this.statblocks.of(character);
    const sent = sentOf(character, this.worldMap, this.quests, drawn);
    const book: PlayerBook = { character: character?.sheet ?? null, worldMap: this.worldMap?.map ?? null, items, notes, pins, quests: sent.quests, purse, slots, equipped };
    this.sent.set(player, sent);
    this.owed.sent(player);
    this.ports.send({ t: 'book', book }, player);
    // The page clears its statblock with every book: one follows it where the character has one.
    if (drawn?.statblock) this.sendStatblock(player, drawn);
    else this.statblocks.sent(player, character, null);
  }

  /** Writes what a player sent into their character's book; false when it is refused. */
  private write(from: string, body: Record<string, unknown>): boolean {
    if (!this.rate.take(from, this.ports.now())) return false;
    const character = this.characters.of(from);
    const message = parsePlayerBookMessage(body);
    if (character === null || message === null || !this.isOnline(from)) return false;
    if (message.t === 'book-resource') return this.editResource(from, character, message);
    if (message.t === 'book-field' || message.t === 'book-ability') return this.statblocks.write(from, character, message);
    const quests = new Set(this.quests.map((quest) => quest.id));
    const written = applyBookMessage(this.shelf.of(character.collection, character.key), message, this.ports.clock(), quests);
    if (written === null) return false;
    this.shelf.keep(character.collection, character.key, written);
    return true;
  }

  /** Hands a checked edit of the player's own resource to Atlas; they are sent their sheet with what it holds then, or their whole book when it was not taken. */
  private editResource(from: string, character: PlayedCharacter, message: BookResourceMessage): boolean {
    const scene = this.ports.scene();
    const edit = checkResourceEdit(from, character, scene, (tokenId) => this.ports.ownerOf(tokenId, scene?.tokens[tokenId]), message);
    if (edit === null) return false;
    this.ports.editResource(edit, (taken) => {
      if (taken === null) return this.owed.owe(from);
      // The sheet goes out even when the value did not change: it answers what the page showed at once.
      if (this.characters.of(from)?.tokenId === character.tokenId) this.characters.setValue(from, edit.key, taken);
      const last = this.sent.get(from);
      if (last !== undefined) this.sent.set(from, { ...last, sheet: '' });
      this.update();
    });
    return true;
  }

  /** What a connected player's book names that they may fetch by hash (`bookAssetOf`). */
  private namedAssets(player: string): NamedAssets | null {
    if (!this.isOnline(player)) return null;
    return {
      worldMap: this.worldMap, character: this.characters.of(player), quests: this.sent.get(player)?.quests ?? NO_QUESTS,
      statblockText: (asked: string) => this.statblocks.text(asked, player),
    };
  }

  private whileRunning(run: () => void): void {
    if (this.stopPoll !== null) run();
  }

  private isOnline(player: string): boolean {
    return this.ports.players().some((known) => known.id === player && known.online);
  }

  /** Tells who listens when the people an item can be handed to changed. */
  private tell(): void {
    this.listeners.tell(this.recipients());
  }
}
