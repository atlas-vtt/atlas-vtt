import { CURSOR_KEEPALIVE_MS, type GmMessage, type MarksMessage } from '../protocol/index.ts';

export interface MarksOutPorts {
  send(body: GmMessage, to?: string): void;
  /** The live lane, where there is one: a newer message under the same key takes the place of one not sent yet. */
  sendLive?(body: GmMessage, key: string, to?: string): void;
}

/** A marks message for its players: every player where unset. */
export interface MarksFor {
  readonly players?: readonly string[];
  readonly body: MarksMessage;
}

interface Told {
  readonly body: MarksMessage;
  readonly text: string;
}

/** The live lane's key for `marks`: one waits at most. */
export const MARKS_KEY = 'marks';

export const isEmptyMarks = (marks: MarksMessage): boolean => marks.lasers.length === 0 && marks.measures.length === 0 && (marks.cursors?.length ?? 0) === 0 && (marks.strokes?.length ?? 0) === 0;

const toldOf = (body: MarksMessage): Told => ({ body, text: JSON.stringify(body) });

/**
 * The marks as each player was last told them, sent through the live lane only where they changed: once to
 * all where every player is told the same, else to each player whose own changed, in one go so the
 * connection batches them into one frame. Nothing goes before anyone made a mark, and cursors that show
 * go out now and then while nothing changes, so a page can tell a GM that went silent.
 */
export class MarksOut {
  /** What every player was told alike; null before anything was. */
  private all: Told | null = null;
  /** What each player was told while they were told apart; empty while everyone is told alike. */
  private each = new Map<string, Told>();
  private sentAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly ports: MarksOutPorts) {}

  /** Tells `marks` at `now` (ms): one message to all, or one per audience. */
  tell(marks: readonly MarksFor[], now: number): void {
    const told = marks.map(({ players, body }) => ({ players, told: toldOf(body) }));
    const keepAlive = marks.some(({ body }) => (body.cursors?.length ?? 0) > 0) && now - this.sentAt >= CURSOR_KEEPALIVE_MS;
    const first = told[0];
    if (first === undefined) return;
    if (told.every(({ told: { text } }) => text === first.told.text)) return this.tellAll(first.told, keepAlive, now);
    const each = new Map<string, Told>();
    let sent = false;
    for (const { players, told: own } of told) {
      for (const player of players ?? []) {
        const before = this.lastOf(player);
        each.set(player, own);
        if ((own.text === before?.text && !keepAlive) || (before === null && isEmptyMarks(own.body))) continue;
        this.out(own.body, player);
        sent = true;
      }
    }
    this.each = each;
    if (sent) this.sentAt = now;
  }

  /** The last marks again, to one player or to all; nothing where they hold none. */
  resend(to?: string): void {
    if (to !== undefined) {
      const told = this.lastOf(to);
      if (told !== null && !isEmptyMarks(told.body)) this.ports.send(told.body, to);
    } else if (this.each.size > 0) {
      for (const [player, told] of this.each) if (!isEmptyMarks(told.body)) this.ports.send(told.body, player);
    } else if (this.all !== null && !isEmptyMarks(this.all.body)) this.ports.send(this.all.body);
  }

  /** The last marks to a player whose map shows again, also where there are none, so marks they held from before go. */
  catchUp(to: string): void {
    const told = this.lastOf(to);
    if (told === null) return;
    if (this.ports.sendLive === undefined) this.ports.send(told.body, to);
    else this.ports.sendLive(told.body, MARKS_KEY, to);
  }

  /** Another scene: nothing told before counts. */
  reset(): void {
    this.all = null;
    this.each = new Map();
  }

  private tellAll(told: Told, keepAlive: boolean, now: number): void {
    if ((this.each.size === 0 && told.text === this.all?.text && !keepAlive) || (this.all === null && this.each.size === 0 && isEmptyMarks(told.body))) return;
    this.all = told;
    this.each = new Map();
    this.sentAt = now;
    this.out(told.body);
  }

  /** What `player` was told last: their own while players are told apart, else what all were. */
  private lastOf(player: string): Told | null {
    return this.each.size > 0 ? this.each.get(player) ?? null : this.all;
  }

  private out(body: MarksMessage, to?: string): void {
    if (this.ports.sendLive === undefined) this.ports.send(body, to);
    else this.ports.sendLive(body, MARKS_KEY, to);
  }
}
