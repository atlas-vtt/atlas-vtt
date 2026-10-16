import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import type { ResolvedStatblock } from '../../../statblocks/model/resolvedTypes';
import type { FieldValue } from '../../../statblocks/model/templateTypes';
import { deepEqual } from '../../../statblocks/notes/listIdentity';
import { readField, type FieldRead, type KeyedField } from '../../../statblocks/values/fieldValues';
import { drawnStatblock, type DrawnStatblock } from './statblockSheet.ts';

/** A value this GM side wrote into a note: the key it stands under now, the keys it was taken from, and the value (undefined: deleted). */
export interface WrittenValue {
  readonly key: string;
  readonly cleared: readonly string[];
  readonly value: FieldValue | undefined;
}

export interface StatblockSheetPorts {
  read(path: string): Promise<ResolvedStatblock | null>;
  now(): number;
  /** A note was read or a statblock drawn anew: the books are looked at again. */
  changed(): void;
}

/** How long a written value counts after its write was taken, should the note never read it back (someone else changed it since). */
export const WRITTEN_MS = 10_000;

interface Held extends WrittenValue {
  /** When its write was taken; null while it is under way. */
  settledAt: number | null;
}

interface Drawing {
  readonly source: ResolvedStatblock;
  readonly inputs: string;
}

interface Entry {
  /** The note as last read; null where it defines no statblock, undefined before it was read. */
  resolved: ResolvedStatblock | null | undefined;
  reading: boolean;
  stale: boolean;
  /** How many changes from outside this GM side's own writes were heard, and how many of them a finished read has taken in. */
  doubted: number;
  trusted: number;
  readonly written: Map<string, Held>;
  /** The note as last read with what was written since: what is drawn and checked. */
  source: ResolvedStatblock | null | undefined;
  asked: Drawing | null;
  /** The drawing of what was last asked for, once it is made. */
  drawn: DrawnStatblock | undefined;
}

/** What a player without a statblock is sent. */
export const NO_STATBLOCK: DrawnStatblock = { statblock: null, texts: [] };

/** The note's record with the values written into it since it was read (writes taken, not those under way). */
function withWritten(resolved: ResolvedStatblock, written: ReadonlyMap<string, Held>): ResolvedStatblock {
  const taken = [...written.values()].filter((held) => held.settledAt !== null);
  if (taken.length === 0) return resolved;
  const fields: Record<string, unknown> = { ...resolved.fields };
  for (const { key, cleared, value } of taken) {
    for (const old of cleared) delete fields[old];
    if (value === undefined) delete fields[key];
    else fields[key] = value;
  }
  return { ...resolved, fields };
}

/**
 * The statblocks of the characters' notes, as their players are sent them: each note read through
 * Atlas's resolver once and again only when it may read otherwise (`forget`), each drawn once for
 * the resources it is drawn with, so the books' poll costs a lookup. Edits are checked against
 * what the note holds with the values this GM side is writing or wrote and has not seen read back
 * yet, so a player's second quick edit names what the first one wrote; a value is drawn once its
 * write was taken, so the statblock that answers an edit shows it before the note reads it back.
 * A written value counts until the note reads it, its write was refused, or `WRITTEN_MS` after it
 * was taken.
 */
export class StatblockSheets {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly ports: StatblockSheetPorts) {}

  /** The drawn statblock of a note for these resources; undefined while it is read or drawn, so nothing older is sent for it. */
  drawn(path: string, definitions: readonly ResourceDefinition[], resources: Readonly<Record<string, ResourceValue>> | undefined): DrawnStatblock | undefined {
    const entry = this.entry(path);
    const source = this.source(entry);
    if (source === undefined) return undefined;
    if (source === null) return NO_STATBLOCK;
    const inputs = JSON.stringify([definitions, resources ?? null]);
    if (entry.asked?.source === source && entry.asked.inputs === inputs) return entry.drawn;
    const asked: Drawing = { source, inputs };
    entry.asked = asked;
    entry.drawn = undefined;
    void drawnStatblock({ resolved: source, definitions, resources }).then((drawn) => {
      if (entry.asked !== asked || this.entries.get(path) !== entry) return;
      entry.drawn = drawn;
      this.ports.changed();
    }, (error: unknown) => console.error('[Atlas] Drawing a player\'s statblock failed:', error));
    return entry.drawn;
  }

  /** The note as it is drawn now (what was written since it was read included), undefined before it was read. */
  resolved(path: string): ResolvedStatblock | null | undefined {
    const entry = this.entries.get(path);
    return entry === undefined ? undefined : this.source(entry);
  }

  /** What a note holds of a field now: what was written and not read back yet, else the note as read. */
  read(path: string, field: KeyedField): FieldRead | undefined {
    const entry = this.entries.get(path);
    const held = entry?.written.get(field.key);
    if (held !== undefined && this.counts(held)) return { value: held.value, key: field.key, viaFormerKey: false };
    const fields = entry?.resolved?.fields;
    return fields === undefined ? undefined : storedRead(fields, field);
  }

  /** Values about to be written: they count from now on. */
  hold(path: string, values: readonly WrittenValue[]): void {
    const entry = this.entry(path);
    for (const value of values) entry.written.set(value.key, { ...value, settledAt: null });
  }

  /** The write of these values was taken. */
  settle(path: string, values: readonly WrittenValue[]): void {
    const entry = this.entries.get(path);
    for (const value of values) {
      const held = entry?.written.get(value.key);
      if (held !== undefined && held.value === value.value) held.settledAt = this.ports.now();
    }
    if (entry !== undefined) entry.source = undefined;
  }

  /** A write into the note was refused: nothing written is assumed of it any more. */
  drop(path: string): void {
    const entry = this.entries.get(path);
    if (entry === undefined || entry.written.size === 0) return;
    entry.written.clear();
    entry.source = undefined;
  }

  /**
   * A note may read otherwise (every note for null): it is read again when next asked for. Until
   * that read is done no edit is checked against it (`checkable`), unless this note alone changed
   * while values this GM side wrote into it are not read back yet: that is taken as the write
   * coming back, so a player's quick second edit still lands. A change of every note (a template)
   * is never taken so.
   */
  forget(path: string | null): void {
    for (const [held, entry] of this.entries) {
      if (path !== null && held !== path) continue;
      entry.stale = true;
      if (path === null || entry.written.size === 0) entry.doubted += 1;
    }
  }

  /** Whether an edit of the note may be checked now: it was read, and no change from outside came since that a finished read has not taken in. */
  checkable(path: string): boolean {
    const entry = this.entries.get(path);
    return entry !== undefined && entry.resolved !== undefined && entry.trusted === entry.doubted;
  }

  /** Notes no character names any more are dropped. */
  retain(paths: ReadonlySet<string>): void {
    for (const path of [...this.entries.keys()]) if (!paths.has(path)) this.entries.delete(path);
  }

  private entry(path: string): Entry {
    let entry = this.entries.get(path);
    if (entry === undefined) {
      entry = { resolved: undefined, reading: false, stale: false, doubted: 0, trusted: 0, written: new Map(), source: undefined, asked: null, drawn: undefined };
      this.entries.set(path, entry);
    }
    this.readIfStale(path, entry);
    return entry;
  }

  private readIfStale(path: string, entry: Entry): void {
    if (entry.reading || (!entry.stale && entry.resolved !== undefined)) return;
    entry.reading = true;
    entry.stale = false;
    const doubted = entry.doubted;
    const read = this.ports.read(path).catch((error: unknown): null => {
      console.error('[Atlas] Reading a player\'s statblock failed:', error);
      return null;
    });
    void read.then((resolved) => {
      entry.reading = false;
      if (this.entries.get(path) !== entry) return;
      entry.resolved = resolved;
      entry.trusted = doubted;
      entry.source = undefined;
      this.readBack(entry);
      this.ports.changed();
    });
  }

  /** Written values the note now reads as written no longer need holding. */
  private readBack(entry: Entry): void {
    const fields = entry.resolved?.fields;
    if (fields === undefined) return;
    for (const [key, held] of [...entry.written]) {
      if (deepEqual(storedRead(fields, { key }).value, held.value)) entry.written.delete(key);
    }
  }

  private counts(held: Held): boolean {
    return held.settledAt === null || this.ports.now() - held.settledAt < WRITTEN_MS;
  }

  private source(entry: Entry): ResolvedStatblock | null | undefined {
    for (const [key, held] of [...entry.written]) {
      if (this.counts(held)) continue;
      entry.written.delete(key);
      entry.source = undefined;
    }
    if (entry.resolved === undefined || entry.resolved === null) return entry.resolved;
    entry.source ??= withWritten(entry.resolved, entry.written);
    return entry.source;
  }
}

/**
 * A field as the note stores it: the resolver gives a renamed field's value under its current key
 * too, so a value read there that a former key holds as the same value is the former key's.
 */
export function storedRead(fields: Readonly<Record<string, unknown>>, field: KeyedField): FieldRead {
  const read = readField(fields, field);
  if (read.value === undefined) return read;
  const former = field.formerKeys?.find((key) => Object.hasOwn(fields, key) && fields[key] === fields[field.key]);
  return former === undefined ? read : { ...read, key: former, viaFormerKey: true };
}
