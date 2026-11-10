/** How many images' reads are kept of each kind: a scene's floors, about 4 MB each. */
const KEPT = 6;

/**
 * What was read of the last few map images in the tessera worker (which pixels hold art, a roof's
 * pieces), by their content's hash: a level shown again, in any view, reads it without asking the
 * worker. A read that fails is not kept.
 */
export class RecentReads<T> {
  private readonly entries = new Map<string, Promise<T>>();

  /** The read of the image whose content is `hash`, made with `read` where it is not kept. */
  of(hash: string, read: () => Promise<T>): Promise<T> {
    let entry = this.entries.get(hash);
    if (entry) {
      // Most recent last.
      this.entries.delete(hash);
    } else {
      entry = read();
      entry.catch(() => {
        if (this.entries.get(hash) === entry) this.entries.delete(hash);
      });
    }
    this.entries.set(hash, entry);
    while (this.entries.size > KEPT) this.entries.delete(this.entries.keys().next().value!);
    return entry;
  }
}
