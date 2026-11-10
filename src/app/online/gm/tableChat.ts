import { GM_AUTHOR, type ChatRefusal, type ChatStyle, type LogEntry, type RollMode, type TablePerson } from '../protocol/index.ts';
import type { OnlineTable } from './OnlineTable.ts';

/** Who a message from another plugin is whispered to: the GM's own eyes, every player, or players by id or name. */
export type ChatAudience = 'gm' | 'players' | readonly string[];

/** A message another plugin posts as the GM. Its text may hold rolls: `[[1d20+5]]` is rolled at once, `[[/r 1d20+2]]{Dex save}` is a button players press to roll. */
export interface TableChatPost {
  readonly text: string;
  /** A token of the shared scene to speak as, by its id: its portrait and name show. */
  readonly speaker?: string;
  readonly style?: ChatStyle;
  readonly whisper?: ChatAudience;
}

/** A roll another plugin makes as the GM. */
export interface TableChatRoll {
  readonly formula: string;
  readonly mode?: RollMode;
  readonly flavor?: string;
  /** A token of the shared scene the roll is made by, by its id. */
  readonly speaker?: string;
}

/** What went wrong: the refusal, or that no table runs. */
export type TableChatResult = { readonly ok: true } | { readonly ok: false; readonly reason: ChatRefusal | 'unavailable' | 'no-table' };

/**
 * The table's log for other plugins, while online play is on: post as the GM (also to prompt players
 * for rolls), roll, read who is at the table and hear every entry. Listeners stay across tables.
 */
export class TableChat {
  private readonly table: () => OnlineTable | null;
  private readonly listeners = new Set<(entry: LogEntry) => void>();
  private attached: { readonly table: OnlineTable; readonly stop: () => void } | null = null;

  constructor(table: () => OnlineTable | null) {
    this.table = table;
  }

  /** Whether a table runs now. */
  get running(): boolean {
    return this.table() !== null;
  }

  /** The players at the table. */
  people(): readonly TablePerson[] {
    return this.table()?.log.people() ?? [];
  }

  async post(post: TableChatPost): Promise<TableChatResult> {
    const table = this.table();
    if (table === null) return { ok: false, reason: 'no-table' };
    const to = audience(post.whisper, table.log.people());
    if (to === null) return { ok: false, reason: 'whisper' };
    const refusal = await table.log.say({
      text: post.text,
      ...(post.speaker !== undefined && { speaker: post.speaker, style: post.style ?? 'ic' }),
      ...(post.speaker === undefined && post.style === 'emote' && { style: 'emote' as const }),
      ...(to !== undefined && { to }),
    });
    return refusal === null ? { ok: true } : { ok: false, reason: refusal };
  }

  async roll(roll: TableChatRoll): Promise<TableChatResult> {
    const table = this.table();
    if (table === null) return { ok: false, reason: 'no-table' };
    const refusal = await table.rollFromLog({ formula: roll.formula, mode: roll.mode ?? 'public', ...(roll.flavor !== undefined && { flavor: roll.flavor }), ...(roll.speaker !== undefined && { speaker: roll.speaker }) });
    return refusal === null ? { ok: true } : { ok: false, reason: refusal };
  }

  /** Hears every entry the GM's log takes; returns the way to stop. */
  onEntry(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener);
    this.sync();
    return () => this.listeners.delete(listener);
  }

  /** Follows the running table: called when it may have changed. */
  sync(): void {
    const table = this.table();
    if (this.attached?.table === table) return;
    this.attached?.stop();
    this.attached = table === null ? null : { table, stop: table.log.listen((entry) => this.listeners.forEach((listener) => listener(entry))) };
  }

  dispose(): void {
    this.attached?.stop();
    this.attached = null;
    this.listeners.clear();
  }
}

/** A whisper's audience as ids: names read without regard to case; undefined for none, null for a name nobody has. */
function audience(whisper: ChatAudience | undefined, people: readonly TablePerson[]): readonly string[] | null | undefined {
  if (whisper === undefined) return undefined;
  if (whisper === 'gm') return [GM_AUTHOR];
  const here = people.filter((person) => person.away !== true);
  if (whisper === 'players') return here.length === 0 ? null : here.map((person) => person.id);
  const ids = whisper.map((wanted) => here.find((person) => person.id === wanted || person.name.toLowerCase() === wanted.toLowerCase())?.id ?? (wanted.toLowerCase() === GM_AUTHOR ? GM_AUTHOR : null));
  return ids.some((id) => id === null) || ids.length === 0 ? null : (ids as string[]);
}
