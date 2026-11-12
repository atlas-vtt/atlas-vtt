import type { TokenRingPart } from '../measurePartsVisibility';
import { MeasureInk, type MeasureInkLayer } from '../utils/measureInk';

/** Screen pixels between a token's rim and the ring around it. */
const RING_GAP = 3;

/** A token an area marks: where it stands and how far its rim lies from its centre, world pixels. */
export interface MarkedToken {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/**
 * The rings on the tokens in one area: around each token, a little off its rim, in the area's
 * colour and in the ink measurements are drawn with, so it keeps its width on screen. Each ring is
 * a part of its own, since the players' picture rings only the tokens the players see
 * (`MeasurePartsVisibility`). A token that stays ringed keeps its ring.
 */
export class AreaTokenRings {
  private readonly inks = new Map<string, MeasureInk>();
  private parts: TokenRingPart[] = [];

  constructor(private readonly layer: MeasureInkLayer) {}

  /** One part per ringed token, in the order they were given. */
  get rings(): readonly TokenRingPart[] {
    return this.parts;
  }

  /** Rings `tokens` in `color` at `zoom`; the rings of tokens no longer among them go. */
  show(tokens: readonly MarkedToken[], color: number, zoom: number): void {
    const ids = new Set(tokens.map((token) => token.id));
    for (const [id, ink] of this.inks) {
      if (ids.has(id)) continue;
      ink.destroy();
      this.inks.delete(id);
    }
    this.parts = tokens.map((token) => {
      let ink = this.inks.get(token.id);
      if (!ink) this.inks.set(token.id, (ink = new MeasureInk(this.layer)));
      ink.begin(zoom);
      const { x, y } = ink.screen(token);
      const radius = ink.screen({ x: token.radius, y: 0 }).x + RING_GAP;
      ink.stroke((g) => { g.circle(x, y, radius); }, color);
      return { tokenId: token.id, layer: ink.shape };
    });
  }

  clear(): void {
    if (this.inks.size > 0) this.show([], 0, 1);
  }

  destroy(): void {
    this.clear();
  }
}
