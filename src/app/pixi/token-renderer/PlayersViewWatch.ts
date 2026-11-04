import type { TokenSeen } from '../../vision/measureOrigin';

/**
 * Tells listeners when what the players see of the tokens may have changed on the canvas while it
 * shows their view: after every pass over their sight, and when a moved token enters or leaves it.
 * A move is checked against the tokens the players saw at the last pass, so a drag that changes
 * nobody's sight tells nobody.
 */
export class PlayersViewWatch {
  private readonly listeners = new Set<() => void>();
  /** The tokens the players saw at the last pass while the canvas showed their view; null in the GM view. */
  private seen: Set<string> | null = null;

  /** Calls `listener` on every change. Returns the function that stops it. */
  listen(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * A pass over the tokens (`tokenIds`): `seen` answers while the canvas shows the players' view, null
   * in the GM view, where nothing follows their sight: listeners hear only of the change into it.
   */
  passed(tokenIds: () => readonly string[], seen: TokenSeen | null): void {
    if (!seen && !this.seen) return;
    this.seen = seen ? new Set(tokenIds().filter((id) => seen(id))) : null;
    this.notify();
  }

  /** A token moved and the players now see it or not (`seen`): listeners hear of it only when that changed. */
  moved(tokenId: string, seen: boolean): void {
    if (!this.seen || this.seen.has(tokenId) === seen) return;
    if (seen) this.seen.add(tokenId);
    else this.seen.delete(tokenId);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
