import { MAX_LOG_ENTRIES, quoting, type ChatRefusal, type LogEntry, type LogMessage, type RollMode, type TablePerson } from '../protocol/index.ts';

/** An entry as a panel shows it; `hidden`: only this viewer has it (a GM's roll the players are not shown). */
export type ShownEntry = LogEntry & { readonly hidden?: true };

export interface LogView {
  readonly entries: readonly ShownEntry[];
  /** Chat messages and rolls by others that arrived while the panel was closed. */
  readonly unread: number;
  /** The last refusal of something this viewer sent; `n` counts them, so the same reason twice is seen twice. */
  readonly refusal: { readonly reason: ChatRefusal; readonly n: number } | null;
  /** Who is at the table, for whispers. */
  readonly people: readonly TablePerson[];
}

/** What the viewer chose in the composer: kept here while the panel is closed. */
export interface ComposerChoices {
  readonly rollMode: RollMode;
  /** The key of the speaker chosen (`SpeakerOption.key`); null for the first option, the viewer as themselves. */
  readonly speaker: string | null;
  /** Who every message goes to until it is cleared; null for everyone. */
  readonly whisperTo: readonly string[] | null;
}

const EMPTY: LogView = { entries: [], unread: 0, refusal: null, people: [] };
const FIRST_CHOICES: ComposerChoices = { rollMode: 'public', speaker: null, whisperTo: null };

/** The entries with every answer to `id` quoting `text`, or nothing once it was deleted (null); the same list where none answers it. */
function requoted(entries: readonly ShownEntry[], id: string, text: string | null): readonly ShownEntry[] {
  if (!entries.some((entry) => entry.kind === 'chat' && entry.reply?.id === id)) return entries;
  return entries.map((entry) => (entry.kind === 'chat' && entry.reply?.id === id ? { ...entry, reply: quoting(entry.reply, text) } : entry));
}

/** The newest `MAX_LOG_ENTRIES` of a list, in its order. */
function newest(entries: readonly ShownEntry[]): readonly ShownEntry[] {
  return entries.length > MAX_LOG_ENTRIES ? entries.slice(entries.length - MAX_LOG_ENTRIES) : entries;
}

/**
 * The table's log as one viewer holds it: the entries in the order they arrived, how many of them
 * came unread, and the last refusal. A panel reads it through `subscribe` and `snapshot`
 * (`useSyncExternalStore`); the player's page feeds it the GM's messages (`receive`), the GM's side
 * its own entries (`replace`) and who is at the table (`setPeople`). The composer's choices are read
 * the same way (`choices`).
 */
export class LogState {
  private view: LogView = EMPTY;
  private chosen: ComposerChoices = FIRST_CHOICES;
  private typed = '';
  private open = false;
  /** Whether a whole log was taken before: the first one is what was there, not news. */
  private filled = false;
  /** The entries that arrived while the panel was closed and are still held. */
  private unread = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private readonly self: () => string | null;

  /** `self`: who the viewer is, `'gm'`, a player's relay id, or null while unknown. */
  constructor(self: () => string | null) {
    this.self = self;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** What the viewer has typed and not sent: kept here while the panel is closed, which unmounts its field. */
  get draft(): string {
    return this.typed;
  }

  keepDraft(text: string): void {
    this.typed = text;
  }

  /** The log as it is; the same object while nothing changed. */
  readonly snapshot = (): LogView => this.view;

  /** What the viewer chose in the composer; the same object while nothing changed. */
  readonly choices = (): ComposerChoices => this.chosen;

  setRollMode(rollMode: RollMode): void {
    this.choose({ rollMode });
  }

  setSpeaker(speaker: string | null): void {
    this.choose({ speaker });
  }

  setWhisperTo(whisperTo: readonly string[] | null): void {
    this.choose({ whisperTo: whisperTo === null || whisperTo.length === 0 ? null : whisperTo });
  }

  /** Sets who is at the table. */
  setPeople(people: readonly TablePerson[]): void {
    this.set({ people });
  }

  /** Takes a message of the GM about the log. */
  receive(message: LogMessage): void {
    switch (message.t) {
      case 'log':
        return this.replace(message.entries);
      case 'log-entry':
        return this.upsert(message.entry);
      case 'log-remove':
        return this.remove(message.id);
      case 'chat-refused':
        return this.set({ refusal: { reason: message.reason, n: (this.view.refusal?.n ?? 0) + 1 } });
      case 'people':
        return this.setPeople(message.people);
    }
  }

  /**
   * Sets all entries. Unread are only those not held before that are no earlier than everything held
   * before, so a log sent again counts nothing twice, and the first log counts nothing at all.
   */
  replace(entries: readonly ShownEntry[]): void {
    const before = new Map(this.view.entries.map((entry) => [entry.id, entry]));
    const latest = this.view.entries.reduce((at, entry) => Math.max(at, entry.at), -Infinity);
    const kept = newest(entries);
    const unread = new Set<string>();
    for (const entry of kept) {
      if (this.unread.has(entry.id)) unread.add(entry.id);
      else if (this.filled && !before.has(entry.id) && entry.at >= latest && this.counts(entry)) unread.add(entry.id);
    }
    this.filled = true;
    this.unread = unread;
    this.set({ entries: kept });
  }

  /** Tells the log whether its panel shows: an open panel has nothing unread, and nothing becomes unread. */
  setOpen(open: boolean): void {
    this.open = open;
    if (!open || this.unread.size === 0) return;
    this.unread = new Set();
    this.set({});
  }

  private upsert(entry: ShownEntry): void {
    const { entries } = this.view;
    const index = entries.findIndex((held) => held.id === entry.id);
    if (index !== -1) {
      const changed = entries.map((held, i) => (i === index ? entry : held));
      // Answers quote a message's new text.
      const before = entries[index];
      const retold = entry.kind === 'chat' && before?.kind === 'chat' && before.text !== entry.text;
      return this.set({ entries: retold ? requoted(changed, entry.id, entry.text) : changed });
    }
    // In the order of the GM's clock: a change to an entry this viewer was not sent (the log was cut to fit) stands where it belongs and is no news.
    const after = entries.findLastIndex((held) => held.at <= entry.at) + 1;
    if (after === entries.length && this.counts(entry)) this.unread.add(entry.id);
    const kept = newest([...entries.slice(0, after), entry, ...entries.slice(after)]);
    if (kept.length <= entries.length) this.forget(entries[0]?.id);
    this.set({ entries: kept });
  }

  private remove(id: string): void {
    const entries = this.view.entries.filter((entry) => entry.id !== id);
    if (entries.length === this.view.entries.length) return;
    this.forget(id);
    // Answers keep standing, without what they quoted.
    this.set({ entries: requoted(entries, id, null) });
  }

  private forget(id: string | undefined): void {
    if (id !== undefined) this.unread.delete(id);
  }

  /** Whether an entry that arrives now is unread: a message, roll (a private one too) or rest of someone else, with the panel closed. */
  private counts(entry: ShownEntry): boolean {
    return !this.open && (entry.kind === 'chat' || entry.kind === 'roll' || entry.kind === 'secret' || entry.kind === 'image' || entry.kind === 'loot' || entry.kind === 'found' || entry.kind === 'rest') && entry.who !== this.self();
  }

  private set(change: Partial<Pick<LogView, 'entries' | 'refusal' | 'people'>>): void {
    const next: LogView = { ...this.view, ...change, unread: this.unread.size };
    const { entries, refusal, unread, people } = this.view;
    if (next.entries === entries && next.refusal === refusal && next.unread === unread && next.people === people) return;
    this.view = next;
    this.notify();
  }

  private choose(change: Partial<ComposerChoices>): void {
    const keys = Object.keys(change) as (keyof ComposerChoices)[];
    if (keys.every((key) => change[key] === this.chosen[key])) return;
    this.chosen = { ...this.chosen, ...change };
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
