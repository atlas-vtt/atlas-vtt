import { ALL_PLAYERS, DeltaReader, isDeltaOf, parseGmMessage, type GmMessage, type SharedScene, type SharedToken, type YourCodeMessage } from '../../../../src/app/online/protocol/index.ts';

/** What reaches a player's page: the game's messages, and their own code. */
export type PageMessage = GmMessage | YourCodeMessage;
type Of<T extends PageMessage['t']> = Extract<PageMessage, { t: T }>;

/** Where each page's reading stood at a moment, to read what came after it (`PlayerPages.since`). */
export type Mark = ReadonlyMap<string, number>;

/**
 * One player's page as their browser follows the table: every message that reached it, and each as
 * the page reads it, a delta as the whole message it makes. A delta that does not follow on from
 * what this page holds is a gap, and reading that kind afterwards throws.
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

  constructor(readonly player: string) {}

  receive(body: PageMessage): void {
    this.inbox.push(body);
    if (body.t !== 'delta' && !isDeltaOf(body.t)) return void this.read.push(body);
    // As the player's browser takes it: parsed from the JSON that went over the wire.
    const read = this.reader.read(parseGmMessage(JSON.parse(JSON.stringify(body))) ?? (body as GmMessage));
    if (read === null || read === 'gap') this.gaps.push(body);
    else this.read.push(read);
  }

  /** Every message of these kinds this page read (of any kind where none is named), in order. */
  all<T extends PageMessage['t']>(...kinds: readonly T[]): Of<T>[] {
    return this.since(0, ...kinds);
  }

  /** The messages of these kinds this page read from its `from`th on (of any kind where none is named). */
  since<T extends PageMessage['t']>(from: number, ...kinds: readonly T[]): Of<T>[] {
    const named = (t: string): boolean => kinds.length === 0 || (kinds as readonly string[]).includes(t);
    const missed = this.gaps.find((gap) => named(gap.t === 'delta' ? gap.of : gap.t));
    if (missed !== undefined) throw new Error(`the page of ${this.player} missed a message before ${JSON.stringify(missed)}`);
    return this.read.slice(from).filter((message): message is Of<T> => named(message.t));
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
      const read = page.since(mark.get(player) ?? 0, ...kinds);
      if (read.length > 0) heard[player] = read;
    }
    return heard;
  }
}

/** What went to every page at once, as one message: a fact of the wire, not of what a page holds. */
export const toAll = <S extends { readonly to: string | undefined }>(sent: readonly S[]): S[] => sent.filter(({ to }) => to === undefined);
