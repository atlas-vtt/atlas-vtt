import { isPlayerBookType, isRecord, parseBookTokenMessage, parsePlayerBookMessage, type BookQuest, type BookResourceMessage, type PlayerBook } from '../../protocol/index.ts';
import type { LootRecipient, LootRecipientSource } from '../../../loot/lootRecipients';
import type { LootDraw } from '../../../loot/lootRoller';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { ArtRefs } from '../artRefs.ts';
import { every } from '../companionTimers.ts';
import { MoveRate } from '../moveCheck.ts';
import { AskedAnswer } from './askedAnswer.ts';
import { BookPasses, type PassScope } from './bookPasses.ts';
import { BookRests } from './bookRests.ts';
import { bookItemOf } from './bookItem.ts';
import type { BookShelf } from './BookShelf.ts';
import { sheetOf } from './bookSheet.ts';
import { placedSheetValues } from './placedResources.ts';
import { trackedSheetValues } from './trackedSheet.ts';
import { applyBookMessage, EMPTY_BOOK, withItem } from './bookStore.ts';
import { Characters, type PlayedCharacter } from './characters.ts';
import type { DrawnStatblock } from './statblockSheet.ts';
import { QuestPlaces } from './questPlaces.ts';
import { SettledPanelWidth } from './settledPanelWidth.ts';
import { RecipientListeners } from './recipientListeners.ts';
import type { BookScene } from './bookScene.ts';
import type { BookSharePorts } from './bookSharePorts.ts';
import { checkResourceEdit, type ResourceEdit } from './resourceEdit.ts';
import { resourceMaxRoute } from './resourceMax.ts';
import { OwedBooks } from './owedBooks.ts';
import { bookUpdate, NO_QUESTS, RESEND, sentOf, type SentBook } from './sentBook.ts';
import { StatblockShare } from './statblockShare.ts';
import { WORLD_MAP_PROBLEM_TEXT, WorldMaps, type MapImageProblem, type WorldMapFile } from './worldMap.ts';

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
 * player character's statblock carries its recovery buttons, and a rest the player asks for waits
 * for the GM's answer (`BookRests`). What a book names is stored for players and named by its id,
 * and a player is named only what their own book holds.
 */
export class BookShare implements LootRecipientSource {
  private readonly ports: BookSharePorts;
  private readonly shelf: BookShelf;
  private readonly characters = new Characters();
  private readonly art: ArtRefs;
  private readonly maps: WorldMaps;
  private readonly questList: AskedAnswer<readonly BookQuest[]>;
  private readonly questPlaces = new QuestPlaces();
  private readonly statblocks: StatblockShare;
  /** The characters' recovery buttons, and the rests players ask for. */
  readonly rests: BookRests;
  private readonly rate = new MoveRate(BOOK_BURST, BOOK_WRITES_PER_SECOND);
  /** The world map as it was last known. */
  private worldMap: WorldMapFile | null = null;
  /** The quests as they were last known. */
  private quests: readonly BookQuest[] = NO_QUESTS;
  private mapPath: string | null = null;
  /** Why the world map's image could not be sent when the GM was last told, so they are told once. */
  private mapProblem: MapImageProblem | null = null;
  /** What each connected player was last sent. */
  private readonly sent = new Map<string, SentBook>();
  /** The players whose page reads its book in parts (`book-parts`): they get a changed world map or quests alone. */
  private readonly parts = new Set<string>();
  /** The whole books players are owed for writes of theirs that were refused. */
  private readonly owed: OwedBooks;
  private readonly listeners = new RecipientListeners();
  /** The passes over the books asked for, made once per burst. */
  private readonly passes = new BookPasses((scope) => this.pass(scope));
  private stopPoll: (() => void) | null = null;

  constructor(ports: BookSharePorts, shelf: BookShelf) {
    this.ports = ports;
    this.shelf = shelf;
    this.art = new ArtRefs((path) => ports.readImage(path), () => this.update(), ports.stored);
    this.maps = new WorldMaps({ stat: (path) => ports.stat(path), readImage: (path) => ports.readImage(path), stored: ports.stored, source: () => ports.worldMap(), read: () => this.update() });
    this.owed = new OwedBooks(ports, (player) => this.sendBook(player));
    this.questList = new AskedAnswer(() => ports.quests(), NO_QUESTS, () => this.update());
    const panel = new SettledPanelWidth(() => ports.statblockPanelWidth?.(), () => ports.now());
    this.statblocks = new StatblockShare({
      read: (path) => ports.readStatblock(path), write: (path, patches) => ports.writeStatblock(path, patches), now: () => ports.now(),
      panelWidth: () => panel.get(),
      stored: ports.stored,
      // What arrives once the table stopped is dropped: nothing more goes out.
      changed: (path) => this.whileRunning(() => this.passes.of(this.characters.playersOfNote(path))),
      answered: (player, asSent) => this.whileRunning(() => this.resendStatblock(player, asSent)),
      owe: (player) => this.whileRunning(() => this.owed.owe(player)),
    });
    this.rests = new BookRests({
      rests: ports.rests, cards: ports.cards, randomId: () => ports.randomId(),
      answer: (player, request, outcome) => ports.send({ t: 'book-rest-answer', request, outcome }, player),
      character: (player) => this.characters.of(player),
      played: () => this.characters.all(),
      mayWrite: (player) => this.isOnline(player) && this.rate.take(player, ports.now()),
      resend: (player) => this.whileRunning(() => this.resendStatblock(player)),
      changed: () => ports.cardsChanged(),
    });
  }

  start(): void {
    this.stopPoll ??= every(this.ports, BOOK_POLL_MS, () => this.update());
    this.update();
  }

  stop(): void {
    this.stopPoll?.();
    this.stopPoll = null;
    this.owed.stop();
    this.rests.stop();
  }

  /** The world map may be another now (the campaign played, its world map or that map's artwork changed): it is asked for anew. */
  worldMapChanged(): void {
    this.maps.forget();
    this.update();
  }

  /** References the books hand out may go another way now (the store refused ids): art, maps, quests and statblocks are read again. */
  refreshAssets(): void {
    this.art.clear();
    this.maps.forgetImages();
    this.maps.forget();
    this.questList.forget();
    this.statblockChanged(null);
  }

  /** The quests may be others now (the campaign played, a quest note written, added or gone): they are asked for anew. */
  questsChanged(): void {
    this.questList.forget();
    this.update();
  }

  /** A character's statblock note may read otherwise (every note for null, a template changed): it is read and drawn again. */
  statblockChanged(path: string | null): void {
    this.statblocks.changed(path);
    this.rests.changed();
    if (path === null) this.update();
    else this.passes.of(this.characters.playersOfNote(path));
  }

  /** Reads the scene again and sends each connected player what changed for them (the whole book, or a part alone), once the current task's work is done. */
  update(): void {
    this.passes.all();
  }

  /**
   * Reads the scene again for the players of `scope` and sends them what changed: everyone on the
   * poll and whenever the world map, the quests or who plays what may have changed, only the players
   * of a note or an edit when only that changed. A character's name is in every other player's
   * statblock (the allies a rest may be taken for), so a pass that renames one looks at everyone.
   */
  private pass(scope: PassScope): void {
    const map = this.maps.get();
    const quests = this.questList.get();
    // Being looked up or read: the books go out once both are known, with them.
    if (map === undefined || quests === undefined) return;
    this.tellMapProblem(map === null ? this.maps.problem() : null);
    this.worldMap = map;
    this.quests = this.questPlaces.of(quests, map?.questPlaces);
    const scene = this.ports.scene();
    const players = this.ports.players();
    const names = this.characters.names();
    if (scene !== null) this.read(scene, new Set(players.map((player) => player.id)), scope === 'all' ? undefined : scope);
    const renamed = scope !== 'all' && !sameNames(names, this.characters.names());
    this.statblocks.retain(this.characters.statblockPaths());
    const online = new Set(players.filter((player) => player.online).map((player) => player.id));
    for (const player of [...this.sent.keys()]) if (!online.has(player)) this.sent.delete(player);
    for (const player of online) if (scope === 'all' || renamed || scope.has(player)) this.sync(player);
    this.tell();
  }

  /** The books again, to one player or to all. */
  resend(to?: string): void {
    if (to === undefined) {
      this.sent.clear();
      this.update();
    } else {
      this.sent.delete(to);
      this.passes.of([to]);
    }
  }

  /** A player left the table: they get their book anew when they are back. */
  playerLeft(player: string): void {
    this.sent.delete(player);
    this.statblocks.left(player);
    this.parts.delete(player);
    this.rests.playerLeft(player);
  }

  /**
   * A player's message: true when it was the book's, so nobody else reads it. That is a write into
   * their book, the token their book follows, or a rest they ask for.
   */
  receive(from: string, body: unknown): boolean {
    if (!isRecord(body)) return false;
    if (body.t === 'book-parts') {
      this.parts.add(from);
      return true;
    }
    if (body.t === 'book-token') return this.follow(from, body);
    if (body.t === 'book-rest') {
      this.rests.receive(from, body);
      return true;
    }
    if (!isPlayerBookType(body.t)) return false;
    if (!this.write(from, body)) this.owed.owe(from);
    return true;
  }

  /** The players who play a character (its library token's id) now. */
  playersOf(character: string): string[] {
    return this.characters.playersOf(character);
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
    this.shelf.keep(character.key, withItem(this.shelf.of(character.key), item));
    this.ports.send({ t: 'book-item', item }, recipientId);
    return true;
  }

  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe(listener);
  }

  /** Who plays which character in the scene (only the players of `only` where it is given), with the artwork of a new scene read afresh. */
  private read(scene: BookScene, known: ReadonlySet<string>, only?: ReadonlySet<string>): void {
    if (scene.mapPath !== this.mapPath) this.art.clear();
    this.mapPath = scene.mapPath;
    this.characters.update(scene, {
      ownerOf: (tokenId) => this.ports.ownerOf(tokenId, scene.tokens[tokenId]),
      isKnown: (player) => known.has(player),
      sheet: (shown, token, statblockPath) => {
        const resolved = statblockPath === null ? null : this.statblocks.resolved(statblockPath);
        // Beside the token's own: the numbers its statblock tracks, and the gauges its template places for resources it holds none of
        const extra = [...trackedSheetValues(resolved, scene.resources, token.resources), ...placedSheetValues(resolved, scene.resources, token.resources)];
        const maxEditable = (definition: ResourceDefinition): boolean => resourceMaxRoute(resolved, definition, token, statblockPath) !== null;
        return sheetOf(shown, token, scene.resources, (path) => this.art.get(path), extra, maxEditable);
      },
      libraryStatblock: (placed) => this.ports.libraryStatblock(placed),
    }, only);
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
    const drawn = this.drawnFor(character);
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

  /** The statblock a character's player gets now, with the character's recovery buttons; undefined while it is read or drawn. */
  private drawnFor(character: PlayedCharacter | null): DrawnStatblock | undefined {
    return this.rests.withRest(character, this.statblocks.of(character));
  }

  /** The player's statblock, which their page holds until their next book. */
  private sendStatblock(player: string, drawn: DrawnStatblock): void {
    this.statblocks.sent(player, this.characters.of(player), drawn);
    this.ports.send({ t: 'book-statblock', statblock: drawn.statblock }, player);
  }

  /** A player's statblock edit was taken: they are sent their statblock again, also where it reads as before unless their page shows what it was sent (`asSent`). */
  private resendStatblock(player: string, asSent = false): void {
    const last = this.sent.get(player);
    if (last !== undefined && !asSent) this.sent.set(player, { ...last, statblock: RESEND });
    // At once: a rest's answer that follows must reach the player after it.
    this.passes.now([player]);
  }

  private sendBook(player: string): void {
    this.owed.paying(player);
    if (!this.isOnline(player)) return;
    const character = this.characters.of(player);
    const { items, notes, pins, purse, slots, equipped } = character === null ? EMPTY_BOOK : this.shelf.of(character.key);
    const drawn = this.drawnFor(character);
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
    // Recovery buttons replaced refills; a page of an older Atlas may still ask for one.
    if (message.t === 'book-refill') return false;
    if (message.t === 'book-field' || message.t === 'book-ability' || message.t === 'book-list') return this.statblocks.write(from, character, message);
    const quests = new Set(this.quests.map((quest) => quest.id));
    const written = applyBookMessage(this.shelf.of(character.key), message, this.ports.clock(), quests);
    if (written === null) return false;
    this.shelf.keep(character.key, written);
    return true;
  }

  /**
   * Hands a checked edit of the player's own resource to Atlas; they are sent their sheet with what it
   * holds then, or their whole book when it was not taken. A maximum their note gives is written into
   * the note first, and the rest of the edit follows once it is in.
   */
  private editResource(from: string, character: PlayedCharacter, message: BookResourceMessage): boolean {
    const scene = this.ports.scene();
    const resolved = character.statblockPath === null ? null : this.statblocks.resolved(character.statblockPath);
    const edit = checkResourceEdit(from, character, scene, (tokenId) => this.ports.ownerOf(tokenId, scene?.tokens[tokenId]), message, resolved);
    if (edit === null) return false;
    const { max } = edit;
    if (max?.route.kind === 'note') return this.statblocks.writeMax(from, character, max.route.field, max.value, () => this.takeResource(from, character, edit));
    this.takeResource(from, character, edit);
    return true;
  }

  private takeResource(from: string, character: PlayedCharacter, edit: ResourceEdit): void {
    this.ports.editResource(edit, (taken, max) => {
      if (taken === null) return this.owed.owe(from);
      // The sheet goes out even when the value did not change: it answers what the page showed at once.
      if (this.characters.of(from)?.tokenId === character.tokenId) this.characters.setValue(from, edit.key, taken, max);
      const last = this.sent.get(from);
      if (last !== undefined) this.sent.set(from, { ...last, sheet: '' });
      this.passes.of([from]);
    });
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

  /** Tells the GM why the world map cannot be sent, once for each reason in a row. */
  private tellMapProblem(problem: MapImageProblem | null): void {
    if (problem !== null && problem !== this.mapProblem) this.ports.notice(WORLD_MAP_PROBLEM_TEXT[problem]);
    this.mapProblem = problem;
  }
}

/** Whether two lists of the characters' names, in the players' order, read the same. */
function sameNames(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  return a.size === b.size && [...a].every(([player, name]) => b.get(player) === name);
}
