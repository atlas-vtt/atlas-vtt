import type { SoundKind } from '../sound/soundTypes';

/** Where the library stands: a root, and a folder relative to it. */
export interface LibraryPlace {
  kind: SoundKind;
  folder: string;
}

/** What the library has open. It is the library's, not a page's, so every page of it shows the same folder. */
export class OpenPlace {
  private place: LibraryPlace = { kind: 'music', folder: '' };
  private readonly listeners = new Set<() => void>();

  get current(): LibraryPlace {
    return this.place;
  }

  /** Without a folder, the root open already stays where it is and another opens at its top. */
  show(kind: SoundKind, folder?: string): void {
    const next = folder ?? (this.place.kind === kind ? this.place.folder : '');
    if (kind === this.place.kind && next === this.place.folder) return;
    this.place = { kind, folder: next };
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
