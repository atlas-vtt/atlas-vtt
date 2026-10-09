import type { TileView } from '../pixi/mapImage/levelOfDetail';
import type { PlayerFrame } from '../types/playerFrame';

/** A view that keeps the map image's tiles of a region loaded and drawn (`MapImage.addDemandRegion`). */
export interface DemandRegions {
  addDemandRegion?(view: TileView): () => void;
}

/**
 * What a players' frame shows of the world and how finely: the rectangle around its centre that
 * its pixels cover at its scale, and the world units each of its device pixels spans.
 */
export function frameView(frame: PlayerFrame): TileView {
  const worldPerPixel = 1 / (frame.scale * frame.resolution);
  const width = frame.width * worldPerPixel;
  const height = frame.height * worldPerPixel;
  return {
    rect: { x: frame.centerX - width / 2, y: frame.centerY - height / 2, width, height },
    worldPerScreenPixel: worldPerPixel,
  };
}

/**
 * Keeps the map image's tiles of the frame the player window shows loaded and drawn, at the
 * window's own size and resolution, which the GM's pane may never ask for. One region at a time,
 * replaced only when the frame shows another part of the world or another detail.
 */
export class PlayerFrameDemand {
  private held: { source: DemandRegions; view: TileView; release: () => void } | null = null;

  /** Asks `source` for the tiles of `frame`; none (and the previous region let go) without a frame. */
  follow(source: DemandRegions, frame: PlayerFrame | null): void {
    const view = frame ? frameView(frame) : null;
    if (view && this.held?.source === source && sameView(this.held.view, view)) return;
    this.release();
    if (!view || !source.addDemandRegion) return;
    this.held = { source, view, release: source.addDemandRegion(view) };
  }

  /** Lets go of the region, as when the window hides or closes. */
  release(): void {
    const held = this.held;
    this.held = null;
    held?.release();
  }
}

function sameView(a: TileView, b: TileView): boolean {
  return a.worldPerScreenPixel === b.worldPerScreenPixel && a.rect.x === b.rect.x && a.rect.y === b.rect.y
    && a.rect.width === b.rect.width && a.rect.height === b.rect.height;
}
