import type { CopyEntry } from './copyEntries';

/** Which entries hold each sound key: the last one made or found for it, and every one that holds it. */
export class CopyKeys {
  private readonly last = new Map<string, CopyEntry>();
  /** Newest last: a row of a file without a record holds the key of the record's copy too. */
  private readonly holders = new Map<string, CopyEntry[]>();

  get(key: string): CopyEntry | undefined {
    return this.last.get(key);
  }

  /** A copy being made is known by its key before anything holds it. */
  making(key: string, entry: CopyEntry): void {
    this.last.set(key, entry);
  }

  hold(key: string, entry: CopyEntry): void {
    this.last.set(key, entry);
    const held = (this.holders.get(key) ?? []).filter((one) => one !== entry && one.key === key);
    this.holders.set(key, [...held, entry]);
  }

  /** Every record that holds a key, newest first. */
  recordIdsOf(key: string): string[] {
    const held = (this.holders.get(key) ?? []).filter((entry) => entry.key === key).map((entry) => entry.recordId);
    return [...new Set(held.reverse())];
  }
}
