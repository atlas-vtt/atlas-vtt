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
