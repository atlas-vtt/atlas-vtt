import { GM_AUTHOR, type LogEntry, type TablePerson } from '../protocol/index.ts';

/** Someone a whisper is for, as the viewer reads it: "you", "GM", a name, or "someone" for a person who left. */
export function personName(id: string, people: readonly TablePerson[], self: string | null): string {
  if (self !== null && id === self) return 'you';
  if (id === GM_AUTHOR) return 'GM';
  return people.find((person) => person.id === id)?.name ?? 'someone';
}

/** Names as a sentence lists them: "Kara", "Kara and GM", "Kara, Mira and GM". */
export function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** An audience as the viewer reads it, the viewer first: "you and Kara", "Kara and GM". */
export function audienceNames(to: readonly string[], people: readonly TablePerson[], self: string | null): string {
  const ordered = self !== null && to.includes(self) ? [self, ...to.filter((id) => id !== self)] : to;
  return nameList(ordered.map((id) => personName(id, people, self)));
}

/** Everyone a whispered entry or a private roll is for besides the viewer: its author and its audience; null for an entry everyone sees. */
export function audienceOf(entry: LogEntry, self: string | null): readonly string[] | null {
  if ((entry.kind !== 'chat' && entry.kind !== 'roll') || entry.to === undefined) return null;
  return [...new Set([entry.who, ...entry.to])].filter((id) => id !== self);
}

/** Who `/reply` whispers to: the author and the other people of the newest whisper the viewer was sent; null where none was. */
export function lastWhisperAudience(entries: readonly LogEntry[], self: string | null): readonly string[] | null {
  if (self === null) return null;
  const whisper = entries.findLast((entry) => entry.kind === 'chat' && entry.who !== self && entry.to?.includes(self) === true);
  const audience = whisper === undefined ? null : audienceOf(whisper, self);
  return audience === null || audience.length === 0 ? null : audience;
}

/** Whether two audiences hold the same people. */
export function sameAudience(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((id) => b.includes(id));
}
