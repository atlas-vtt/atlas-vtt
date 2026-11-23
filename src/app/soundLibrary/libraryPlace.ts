import type { SoundKind } from '../sound/soundTypes';
import { tagKey } from './soundTags';

/** What the library shows: a root, narrowed to the tracks with all of these tags. */
export interface LibraryPlace {
  kind: SoundKind;
  tags: readonly string[];
}

/** It is the library's, not a page's, so every page of it shows the same. */
export class OpenPlace {
  private place: LibraryPlace = { kind: 'music', tags: [] };
  private readonly listeners = new Set<() => void>();

  get current(): LibraryPlace {
    return this.place;
  }

  show(kind: SoundKind, tags: readonly string[] = []): void {
    if (kind === this.place.kind && tags.length === this.place.tags.length && tags.every((tag, index) => tag === this.place.tags[index])) return;
    this.place = { kind, tags };
    for (const listener of this.listeners) listener();
  }

  /** A tag renamed stays selected under its new name. */
  renameTag(from: string, to: string): void {
    this.show(this.place.kind, this.place.tags.map((tag) => (tagKey(tag) === tagKey(from) ? to : tag)));
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** What the rows go by: their name, or how long they play. */
export type RowSortKey = 'name' | 'length';

export interface RowSort {
  by: RowSortKey;
  descending: boolean;
}

/** Today's order, and the order of a viewer who never chose: by name, A to Z. */
export const NAME_ORDER: RowSort = { by: 'name', descending: false };

/** Where a viewer's choice is kept: this device's own storage, never synced data. */
export interface SortMemory {
  read(): unknown;
  write(sort: RowSort): void;
}

/** Trust boundary: storage may hold what another Atlas wrote, or nothing. */
function readSort(value: unknown): RowSort {
  if (typeof value !== 'object' || value === null) return NAME_ORDER;
  const { by, descending } = value as Partial<Record<keyof RowSort, unknown>>;
  return (by === 'name' || by === 'length') && typeof descending === 'boolean' ? { by, descending } : NAME_ORDER;
}

/** The order the rows are shown in: the library's, so the DM screen's Sound page and the Sound tab show the same, and kept on this device. */
export class SortChoice {
  private sort: RowSort;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly memory?: SortMemory) {
    this.sort = readSort(safely(() => memory?.read()));
  }

  get current(): RowSort {
    return this.sort;
  }

  /** A press on a column: its own column turns the order round, another starts at its first order (A to Z, shortest first). */
  press(by: RowSortKey): void {
    this.sort = { by, descending: by === this.sort.by ? !this.sort.descending : false };
    const sort = this.sort;
    safely(() => this.memory?.write(sort));
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/** Storage can be out of reach (a private window, a full quota): the choice then lasts the session. */
function safely<T>(work: () => T): T | undefined {
  try {
    return work();
  } catch {
    return undefined;
  }
}
