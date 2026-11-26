import type { ShownPlaces } from '../../lighting/shownPlaces';
import type { Point } from '../../types/visionTypes';

const NOWHERE: Point = { x: 0, y: 0 };

/**
 * How far each token is drawn from where the store has it while it glides there (`ShownPlaces`),
 * for what is drawn with a token: it is drawn at the token's place in the store and shifted by this.
 */
export class TokenOffsets {
  private source: { readonly places: ShownPlaces; readonly storedAt: (tokenId: string) => Point | undefined; readonly stop: () => void } | null = null;

  /** Follows `places`, where the store has a token by `storedAt`; `changed` hears of every glide's step. */
  follow(places: ShownPlaces, storedAt: (tokenId: string) => Point | undefined, changed: () => void): void {
    this.stop();
    this.source = { places, storedAt, stop: places.onChange(changed) };
  }

  /** How far `token` is drawn from its place in the store; nothing for none, or one drawn there. */
  of(token: string | null): Point {
    if (token === null || this.source === null) return NOWHERE;
    const at = this.source.places.get(token);
    const stored = at && this.source.storedAt(token);
    return at && stored ? { x: at.x - stored.x, y: at.y - stored.y } : NOWHERE;
  }

  stop(): void {
    this.source?.stop();
    this.source = null;
  }
}
