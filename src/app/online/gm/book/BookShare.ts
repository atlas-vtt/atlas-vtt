import { isPlayerBookType, isRecord, parsePlayerBookMessage, parsePlayerMessage, type BookQuest, type BookResourceMessage, type GmMessage, type PlayerBook } from '../../protocol/index.ts';
import type { LootRecipient, LootRecipientSource } from '../../../loot/lootRecipients';
import type { LootDraw } from '../../../loot/lootRoller';
import { ArtRefs } from '../artRefs.ts';
import { AssetAnswers } from '../assetAnswers.ts';
import type { ScaleImage } from '../assetVariants.ts';
import { every, type Timers } from '../companionTimers.ts';
import { MoveRate } from '../moveCheck.ts';
import { AskedAnswer } from './askedAnswer.ts';
import { bookAssetOf, bookPicture } from './bookAssets.ts';
import type { KnownPlayer, OwnedToken } from '../ownership.ts';
import type { VaultImage } from '../TokenShare.ts';
import { bookItemOf } from './bookItem.ts';
import type { BookScene } from './bookScene.ts';
import type { BookShelf } from './BookShelf.ts';
import { sheetOf } from './bookSheet.ts';
import { applyBookMessage, EMPTY_BOOK, withItem } from './bookStore.ts';
import { Characters, type PlayedCharacter } from './characters.ts';
import type { QuestAsset } from './questGate.ts';
import { QuestPlaces } from './questPlaces.ts';
import { checkResourceEdit, type ResourceEdit } from './resourceEdit.ts';
import type { ResourceAnswer } from './resourceWrites.ts';
import { NO_QUESTS, sentOf, type SentBook } from './sentBook.ts';
import { WorldMaps, type FileStat, type WorldMapFile, type WorldMapTree } from './worldMap.ts';

export interface BookSharePorts extends Timers {
  send(body: GmMessage, to: string): void;
  /** The GM's clock, which notes and items are stamped with. */
  clock(): number;
  /** A new item's id: 24 hex characters from the cryptographic source. */
  randomId(): string;
  /** The shared scene as the books read it, or null while none is shown: the books then stay as they were. */
  scene(): BookScene | null;
  /** Everyone the table knows, and who of them is connected. */
  players(): readonly KnownPlayer[];
  /** The owner of a token of the shared scene (`Ownership.ownerOf`). */
  ownerOf(tokenId: string, token: OwnedToken | undefined): string | undefined;
  readImage(path: string): Promise<VaultImage | null>;
  /** The file at a vault path as it is now, or null when there is none. */
  stat(path: string): FileStat | null;
  /** The world map players may be shown now with the maps it leads into, or null for none. */
  worldMap(): Promise<WorldMapTree | null>;
  /** The quests of the campaign being played, as players read them: the same for every character. */
  quests(): Promise<readonly BookQuest[]>;
  /** What a quest's whole text or image is served from, by hash, while the quests last answered name it. */
  questAsset(hash: string): QuestAsset | undefined;
  /** Writes a checked edit of a player's own resource into Atlas, and answers what the resource holds then (null when it was not taken), at once or later. */
  editResource(edit: ResourceEdit, answer: ResourceAnswer): void;
  /** Scales an image for a player who asks for a longest side; without it players get originals only. */
  scaleImage?: ScaleImage | undefined;
}

/** How often the scene is read again: a sheet follows its token within this time, however often the store changes. */
export const BOOK_POLL_MS = 400;
/** What a player may write into their book: a burst of `BOOK_BURST` edits, then `BOOK_WRITES_PER_SECOND`. */
export const BOOK_BURST = 30;
export const BOOK_WRITES_PER_SECOND = 2;
/**
 * The shortest time between two whole books sent to one player in answer to what was refused of
 * them: the first refusal is answered at once, a flood of them with one book per this time.
 */
export const REFUSAL_BOOK_MS = 5_000;

/** What a character without a name is called where the GM picks who gets an item. */
const UNNAMED = 'Unnamed character';

/**
 * The players' books: each connected player's own pages besides the table, sent to that player
 * alone and never to all. A book is its character's (`Characters`): the sheet is read from the
 * shared scene, items, notes, pins and purse are kept on the shelf, the world map of the campaign
 * being played and its quests (the GM's quest notes, which no player writes) go to everyone at the
 * table, with a character or without; notes on a quest name it by its id. It is the table's, not a
 * scene's, so it hears players while no scene is shared. What a player writes is taken as
 * the protocol's parser cleaned it, only for a player with a character and within their rate; a
 * refused write is answered with the whole book. A player changes their own character's resources
 * through Atlas (`editResource`), and the sheet that follows tells them what was taken. A player is
 * served by hash what their book names (`bookAssetOf`), and nobody another character's artwork.
 */
export class BookShare implements LootRecipientSource {
  private readonly ports: BookSharePorts;
  private readonly shelf: BookShelf;
  private readonly characters = new Characters();
  private readonly art: ArtRefs;
  private readonly maps: WorldMaps;
  private readonly questList: AskedAnswer<readonly BookQuest[]>;
  private readonly questPlaces = new QuestPlaces();
  private readonly answers: AssetAnswers;
  private readonly rate = new MoveRate(BOOK_BURST, BOOK_WRITES_PER_SECOND);
  /** The world map as it was last known. */
  private worldMap: WorldMapFile | null = null;
  /** The quests as they were last known. */
  private quests: readonly BookQuest[] = NO_QUESTS;
  private mapPath: string | null = null;
  /** What each connected player was last sent. */
  private readonly sent = new Map<string, SentBook>();
  /** When each player was last sent a whole book, and the timers of those who are owed one. */
  private readonly bookAt = new Map<string, number>();
  private readonly owed = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private told = '[]';
  private stopPoll: (() => void) | null = null;

  constructor(ports: BookSharePorts, shelf: BookShelf) {
    this.ports = ports;
    this.shelf = shelf;
    this.art = new ArtRefs((path) => ports.readImage(path), () => this.update());
    this.maps = new WorldMaps({ stat: (path) => ports.stat(path), readImage: (path) => ports.readImage(path), source: () => ports.worldMap(), read: () => this.update() });
    this.questList = new AskedAnswer(() => ports.quests(), NO_QUESTS, () => this.update());
    const picture = bookPicture((hash, player) => this.assetOf(hash, player));
    this.answers = new AssetAnswers({ send: (body, to) => ports.send(body, to), now: () => ports.now(), readImage: (path) => ports.readImage(path), scaleImage: ports.scaleImage }, picture);
  }

  start(): void {
    this.stopPoll ??= every(this.ports, BOOK_POLL_MS, () => this.update());
    this.update();
  }

  stop(): void {
    this.stopPoll?.();
    this.stopPoll = null;
    for (const timer of this.owed.values()) this.ports.clearTimer(timer);
    this.owed.clear();
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
    const online = new Set(players.filter((player) => player.online).map((player) => player.id));
    for (const player of [...this.sent.keys()]) if (!online.has(player)) this.sent.delete(player);
    for (const player of online) this.sync(player);
    this.tell();
  }

  /** The books again, to one player or to all; sent to all, their assets may be asked for again at once. */
  resend(to?: string): void {
    if (to === undefined) {
      this.sent.clear();
      this.answers.forget();
    } else this.sent.delete(to);
    this.update();
  }

  /** A player left the table: chunks queued for them are dropped, and they get their book anew when they are back. */
  playerLeft(player: string): void {
    this.answers.forget(player);
    this.sent.delete(player);
  }

  /**
   * A player's message: true when it was the book's, so nobody else reads it. That is a write into
   * their book, and a request for an asset only their book names (their character's artwork while
   * the scene does not show it, the world map).
   */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body)) return false;
    if (body.t === 'asset-request') {
      const request = parsePlayerMessage(body);
      if (request?.t !== 'asset-request' || this.assetOf(request.hash, from) === undefined) return false;
      this.answers.answer(from, request);
      return true;
    }
    if (!isPlayerBookType(body.t)) return false;
    if (!this.write(from, body)) this.owe(from);
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
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Who plays which character in the scene, with the artwork of a new scene read afresh. */
  private read(scene: BookScene, known: ReadonlySet<string>): void {
    if (scene.mapPath !== this.mapPath) this.art.clear();
    this.mapPath = scene.mapPath;
    this.characters.update(scene, {
      ownerOf: (tokenId) => this.ports.ownerOf(tokenId, scene.tokens[tokenId]),
      isKnown: (player) => known.has(player),
      sheet: (shown, token) => sheetOf(shown, token, scene.resources, (path) => this.art.get(path)),
    });
  }

  private sync(player: string): void {
    const character = this.characters.of(player);
    const now = sentOf(character, this.worldMap, this.quests);
    const last = this.sent.get(player);
    if (last === undefined || last.book !== now.book || last.map !== now.map || last.quests !== now.quests) return this.sendBook(player);
    if (last.sheet === now.sheet) return;
    this.sent.set(player, now);
    this.ports.send({ t: 'book-sheet', character: character?.sheet ?? null }, player);
  }

  private sendBook(player: string): void {
    const timer = this.owed.get(player);
    if (timer !== undefined) this.ports.clearTimer(timer);
    this.owed.delete(player);
    if (!this.isOnline(player)) return;
    const character = this.characters.of(player);
    const { items, notes, pins, purse, slots, equipped } = character === null ? EMPTY_BOOK : this.shelf.of(character.collection, character.key);
    const sent = sentOf(character, this.worldMap, this.quests);
    const book: PlayerBook = { character: character?.sheet ?? null, worldMap: this.worldMap?.map ?? null, items, notes, pins, quests: sent.quests, purse, slots, equipped };
    this.sent.set(player, sent);
    this.bookAt.set(player, this.ports.now());
    this.ports.send({ t: 'book', book }, player);
  }

  /** The player is owed their whole book (a write of theirs was refused): now, or once `REFUSAL_BOOK_MS` have passed since their last. */
  private owe(player: string): void {
    if (this.owed.has(player)) return;
    const wait = (this.bookAt.get(player) ?? Number.NEGATIVE_INFINITY) + REFUSAL_BOOK_MS - this.ports.now();
    if (wait <= 0) return this.sendBook(player);
    this.owed.set(player, this.ports.setTimer(() => {
      this.owed.delete(player);
      this.sendBook(player);
    }, wait));
  }

  /** Writes what a player sent into their character's book; false when it is refused. */
  private write(from: string, body: Record<string, unknown>): boolean {
    if (!this.rate.take(from, this.ports.now())) return false;
    const character = this.characters.of(from);
    const message = parsePlayerBookMessage(body);
    if (character === null || message === null || !this.isOnline(from)) return false;
    if (message.t === 'book-resource') return this.editResource(from, character, message);
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
      if (taken === null) return this.owe(from);
      // The sheet goes out even when the value did not change: it answers what the page showed at once.
      if (this.characters.of(from)?.tokenId === character.tokenId) this.characters.setValue(from, edit.key, taken);
      const last = this.sent.get(from);
      if (last !== undefined) this.sent.set(from, { ...last, sheet: '' });
      this.update();
    });
    return true;
  }

  /** What an asset only this player's book names is served from, by hash (`bookAssetOf`). */
  private assetOf(hash: string, player: string): QuestAsset | undefined {
    if (!this.isOnline(player)) return undefined;
    const named = { worldMap: this.worldMap, character: this.characters.of(player), quests: this.sent.get(player)?.quests ?? NO_QUESTS };
    return bookAssetOf(hash, named, (asked) => this.ports.questAsset(asked));
  }

  private isOnline(player: string): boolean {
    return this.ports.players().some((known) => known.id === player && known.online);
  }

  /** Tells who listens when the people an item can be handed to changed. */
  private tell(): void {
    const recipients = JSON.stringify(this.recipients());
    if (recipients === this.told) return;
    this.told = recipients;
    for (const listener of [...this.listeners]) listener();
  }
}
