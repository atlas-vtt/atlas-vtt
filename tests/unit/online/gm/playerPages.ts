import { ALL_PLAYERS, DeltaReader, isDeltaOf, parseGmMessage, type GmMessage, type SharedScene, type SharedToken, type YourCodeMessage } from '../../../../src/app/online/protocol/index.ts';

/** What reaches a player's page: the game's messages, and their own code. */
export type PageMessage = GmMessage | YourCodeMessage;
type Of<T extends PageMessage['t']> = Extract<PageMessage, { t: T }>;

/** What each page read, by player (`PlayerPages.since`, `PlayerPages.heard`). */
export type Heard = Readonly<Record<string, readonly PageMessage[]>>;

/** Where each page's reading stood at a moment, to read what came after it (`PlayerPages.since`). */
export type Mark = ReadonlyMap<string, number>;

/** Puts messages sent in parts (`messageParts`) back together. */
export class PartJoiner {
  private readonly held = new Map<string, string[]>();

  /** The message `part` completes among the parts kept under `key`, or null while some are missing. */
  join(key: string, part: Of<'part'>): PageMessage | null {
    const held = this.held.get(key) ?? [];
    held[part.index] = part.data;
    this.held.set(key, held);
    if (held.filter((data) => data !== undefined).length < part.count) return null;
    this.held.delete(key);
    return JSON.parse(Buffer.concat(held.map((data) => Buffer.from(data, 'base64'))).toString('utf8')) as PageMessage;
  }
}

/**
 * One player's page as their browser follows the table: every message that reached it (one sent in
 * parts once its last part came), and each as the page reads it, a delta as the whole message it
 * makes. A delta that does not follow on from what this page holds is a gap, and reading that kind
 * afterwards throws.
 */
export class PlayerPage {
  /** Every message that reached this page, in order, as it was sent. */
  readonly inbox: PageMessage[] = [];
  /** What this page made of each message, in order: a delta as the whole message it makes. */
  readonly read: PageMessage[] = [];
  /** The deltas that did not follow on from what this page held. */
  readonly gaps: PageMessage[] = [];
  connected = false;
  private readonly reader = new DeltaReader();
  private readonly parts = new PartJoiner();

  constructor(readonly player: string) {}

  receive(sent: PageMessage): void {
    // As it came over the wire: what the GM changes in the object it sent afterwards never reaches the page.
    const body = sent.t === 'part' ? this.parts.join(sent.id, sent) : (JSON.parse(JSON.stringify(sent)) as PageMessage);
    if (body === null) return;
    this.inbox.push(body);
    if (body.t !== 'delta' && !isDeltaOf(body.t)) return void this.read.push(body);
    // As the player's browser reads it: parsed, then a delta applied to what the page holds.
    const read = this.reader.read(parseGmMessage(body) ?? (body as GmMessage));
    if (read === null || read === 'gap') this.gaps.push(body);
    else this.read.push(read);
  }

  /** Every message of these kinds this page read (of any kind where none is named), in order. */
  all<T extends PageMessage['t']>(...kinds: readonly T[]): Of<T>[] {
    return this.since(new Map(), ...kinds);
  }

  /** The messages of these kinds this page read after `mark` (all it read where it joined later), of any kind where none is named. */
  since<T extends PageMessage['t']>(mark: Mark, ...kinds: readonly T[]): Of<T>[] {
    const named = (t: string): boolean => kinds.length === 0 || (kinds as readonly string[]).includes(t);
    const missed = this.gaps.find((gap) => named(gap.t === 'delta' ? gap.of : gap.t));
    if (missed !== undefined) throw new Error(`the page of ${this.player} missed a message before ${JSON.stringify(missed)}`);
    return this.read.slice(mark.get(this.player) ?? 0).filter((message): message is Of<T> => named(message.t));
  }

  last<T extends PageMessage['t']>(t: T): Of<T> | undefined {
    return this.all(t).at(-1);
  }

  /** The scene this page shows: null once it was told none, undefined before it heard of one. */
  get scene(): SharedScene | null | undefined {
    return this.last('scene')?.scene;
  }

  /** The tokens of the last token list this page holds. */
  get tokens(): readonly SharedToken[] {
    return this.last('tokens')?.tokens ?? [];
  }

  /** What this page sees by now: the last sight it holds, undefined before any. */
  get sight(): Of<'sight'> | undefined {
    return this.last('sight');
  }
}

/**
 * The players' pages at a table, one per player: a message to one player reaches their page while
 * it is connected, a message to all every page connected then, as the relay hands them on.
 */
export class PlayerPages {
  private readonly pages = new Map<string, PlayerPage>();

  /** The GM sends a message: to one player, or to all (unset, or the relay's `ALL_PLAYERS`). */
  deliver(body: PageMessage, to?: string): void {
    const player = to === ALL_PLAYERS ? undefined : to;
    for (const page of this.pages.values()) if (page.connected && (player === undefined || page.player === player)) page.receive(body);
  }

  /** These players' pages connect: a page that was here before comes back holding what it held. */
  join(...players: readonly string[]): void {
    for (const player of players) {
      const page = this.pages.get(player) ?? new PlayerPage(player);
      page.connected = true;
      this.pages.set(player, page);
    }
  }

  /** A player's page goes: it hears nothing until it joins again. */
  leave(player: string): void {
    this.of(player).connected = false;
  }

  of(player: string): PlayerPage {
    const page = this.pages.get(player);
    if (page === undefined) throw new Error(`no page of ${player} joined`);
    return page;
  }

  mark(): Mark {
    return new Map([...this.pages].map(([player, page]) => [player, page.read.length]));
  }

  /** What each page read of these kinds after `mark` (of any kind where none is named), by player; a page that read none is left out. */
  since<T extends PageMessage['t']>(mark: Mark, ...kinds: readonly T[]): Record<string, Of<T>[]> {
    const heard: Record<string, Of<T>[]> = {};
    for (const [player, page] of this.pages) {
      const read = page.since(mark, ...kinds);
      if (read.length > 0) heard[player] = read;
    }
    return heard;
  }

  /** What each page read of these kinds, by player; a page that read none is left out. */
  heard<T extends PageMessage['t']>(...kinds: readonly T[]): Record<string, Of<T>[]> {
    return this.since(new Map(), ...kinds);
  }
}

/** What went to every page at once, as one message: a fact of the wire, not of what a page holds. */
export const toAll = <S extends { readonly to: string | undefined }>(sent: readonly S[]): S[] => sent.filter(({ to }) => to === undefined);
