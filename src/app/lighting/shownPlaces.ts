import type { Point } from '../types/visionTypes';

/**
 * Where tokens are drawn while they glide to the place the store gives them (`TokenGlide`). Sight
 * and light read a gliding token there (`followShownPlaces`), so what it sees, its footprint and the
 * light it carries move with its sprite instead of arriving before it. A token that does not glide
 * is not listed: it is drawn where the store has it.
 */
export class ShownPlaces {
  private readonly places = new Map<string, Point>();
  private readonly listeners = new Set<() => void>();
  private changed = false;
  /** Counts the flushes that changed something, so a reader can tell whether it has read the latest. */
  revision = 0;

  get size(): number {
    return this.places.size;
  }

  entries(): IterableIterator<[string, Point]> {
    return this.places.entries();
  }

  /** Notes where `tokenId` is drawn on its way; listeners hear of it at the next `flush`. */
  set(tokenId: string, x: number, y: number): void {
    const place = this.places.get(tokenId);
    if (place?.x === x && place.y === y) return;
    this.places.set(tokenId, { x, y });
    this.changed = true;
  }

  /** `tokenId` is drawn where the store has it again. */
  delete(tokenId: string): void {
    if (this.places.delete(tokenId)) this.changed = true;
  }

  clear(): void {
    if (this.places.size === 0) return;
    this.places.clear();
    this.changed = true;
  }

  /** Tells the listeners once of everything that changed since the last flush. */
  flush(): void {
    if (!this.changed) return;
    this.changed = false;
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
