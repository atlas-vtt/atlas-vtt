import type { SoundKind } from '../sound/soundTypes';
import { keptFirst, stemCopyOf } from './copyNames';
import type { SoundFileEntry } from './soundLocation';
import { joinRelative, parentOfRelative } from './soundPaths';

/** How long notes rest before the view hears of them: a start reads hundreds of copies, a few at a time. */
const NOTES_REST_MS = 150;

/** What a copy said of itself when it was read, and how large it was then. */
interface Noted {
  from: string;
  size: number;
  /** How many frames at 48 kHz it plays; unknown where whoever read it did not say. */
  frames?: number;
}

/** The file a root lists at a path now; null where it lists none. */
export type ListedFile = (kind: SoundKind, path: string) => SoundFileEntry | null;

const keyOf = (kind: SoundKind, path: string): string => `${kind}\n${path}`;

/** The source a copy names beside itself; null where its name could stand for no file in its folder. */
function sourceOf(copy: string, from: string): string | null {
  if (from === '' || from.startsWith('.') || from.includes('/') || from.includes('\\') || from.includes('\0')) return null;
  return joinRelative(parentOfRelative(copy), from);
}

/**
 * The Atlas copies this device has read in its roots this session: what each was made from, as the reads that tell
 * a copy by its header found it. Nothing is read for it. A source with its own copy beside it (a kept original, or
 * one a crash left before it went to the trash) is that copy's, and the library lists the copy alone.
 */
export class KnownCopies {
  private readonly copies = new Map<string, Noted>();
  /** Copy paths by the source each names. */
  private readonly bySource = new Map<string, Set<string>>();
  private notedRevision = 0;
  private timer = 0;

  constructor(
    private readonly listed: ListedFile,
    private readonly onChange: () => void,
  ) {}

  /** Changes once the view should look again at which sources have copies. */
  get revision(): number {
    return this.notedRevision;
  }

  /** A copy at `path` was read: made from `from`, `size` bytes, `frames` long. */
  note(kind: SoundKind, path: string, from: string, size: number, frames?: number): void {
    const at = keyOf(kind, path);
    const before = this.copies.get(at);
    if (before?.from === from && before.size === size) {
      if (frames !== undefined) before.frames = frames;
      return;
    }
    const formerSource = before ? sourceOf(path, before.from) : null;
    if (formerSource !== null) this.bySource.get(keyOf(kind, formerSource))?.delete(path);
    this.copies.set(at, frames === undefined ? { from, size } : { from, size, frames });
    const source = sourceOf(path, from);
    if (source === null || source === path) return;
    const holders = this.bySource.get(keyOf(kind, source)) ?? new Set<string>();
    holders.add(path);
    this.bySource.set(keyOf(kind, source), holders);
    if (this.listed(kind, source)) this.soon();
  }

  /**
   * The copy `source` lies beside: an Atlas copy in its folder made from its name, still listed at the size it was
   * read at. The one named after the source comes first, then the lowest path, so every device decides alike.
   */
  copyOf(kind: SoundKind, source: string): string | null {
    // Asked for every file of a root on every listing: nothing to look up where no copy lies beside its source.
    if (this.bySource.size === 0) return null;
    const holders = this.bySource.get(keyOf(kind, source));
    if (!holders || holders.size === 0) return null;
    const ordered = [...holders].sort(keptFirst(stemCopyOf(source)));
    return ordered.find((path) => this.listed(kind, path)?.size === this.copies.get(keyOf(kind, path))?.size) ?? null;
  }

  /** How many frames the copy at `path` plays, as its header said when it was read at this size; null where that is not known. */
  framesOf(kind: SoundKind, path: string, size: number): number | null {
    const noted = this.copies.get(keyOf(kind, path));
    return noted?.size === size && noted.frames !== undefined ? noted.frames : null;
  }

  dispose(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private soon(): void {
    if (this.timer !== 0) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      this.notedRevision++;
      this.onChange();
    }, NOTES_REST_MS);
  }
}
