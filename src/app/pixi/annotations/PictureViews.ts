import type { Viewport } from 'pixi-viewport';
import type { Box } from '../../vision/polygonBounds';
import type { TesseraView } from '../mosaicCanvas/levelOfDetail';

/**
 * How far past a picture's edge the world counts as shown, as a share of the picture's size: what
 * a pan brings into view was drawn a moment before it shows.
 */
const MARGIN = 0.25;

/** The camera as it was last read. */
interface Camera {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

const boxOf = ({ rect }: TesseraView): Box => ({ minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height });
const holds = (outer: Box, inner: Box): boolean => inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY;

function grown(box: Box): Box {
  const x = (box.maxX - box.minX) * MARGIN;
  const y = (box.maxY - box.minY) * MARGIN;
  return { minX: box.minX - x, minY: box.minY - y, maxX: box.maxX + x, maxY: box.maxY + y };
}

/**
 * The parts of the world the pictures of a map show: the view's own camera, and every region
 * asked for (the player window's frame), each with a margin. `changed` is told them whenever one
 * is another; `whole` then says that the picture is rendered at once and must lack nothing. The
 * camera moves without a word (`moveCenter`, `setZoom`, a glide), so whoever owns this calls
 * `look` in the frame's tick. Null tells that everything shows: before the camera can be read,
 * and for a picture of the whole scene.
 */
export class PictureViews {
  private readonly regions = new Set<TesseraView>();
  private readonly camera: Camera = { x: Number.NaN, y: Number.NaN, zoom: Number.NaN, width: Number.NaN, height: Number.NaN };
  private told: readonly Box[] | null = null;
  /** A region came or went since the pictures were last told. */
  private stale = true;

  constructor(private readonly viewport: Viewport, private readonly changed: (views: readonly Box[] | null, whole: boolean) => void) {}

  /** Reads the camera, and tells the pictures where it or a region is another than when they were last told. */
  look(): void {
    const { x, y, scale, screenWidth, screenHeight } = this.viewport;
    const zoom = Math.abs(scale.x);
    const camera = this.camera;
    if (!this.stale && camera.x === x && camera.y === y && camera.zoom === zoom && camera.width === screenWidth && camera.height === screenHeight) return;
    Object.assign(camera, { x, y, zoom, width: screenWidth, height: screenHeight });
    this.stale = false;
    if (!(zoom > 0) || !(screenWidth > 0) || !(screenHeight > 0)) {
      if (this.told !== null) this.tell(null);
      return;
    }
    const left = -x / zoom;
    const top = -y / zoom;
    const pictures = [{ minX: left, minY: top, maxX: left + screenWidth / zoom, maxY: top + screenHeight / zoom }, ...[...this.regions].map(boxOf)];
    this.tell(pictures.map(grown));
  }

  /** A picture rendered with a camera of its own shows `region`, until the returned function is called. */
  addRegion(region: TesseraView): () => void {
    this.regions.add(region);
    this.stale = true;
    return (): void => {
      if (this.regions.delete(region)) this.stale = true;
    };
  }

  /**
   * Shows all of what `picture` shows for a render that follows at once, and all of the scene for
   * null; the returned function puts back what was shown. Nothing changes where the pictures told
   * already show it: a players' frame is one of them, and is drawn as they are.
   */
  showFor(picture: TesseraView | null): () => void {
    const before = this.told;
    const box = picture ? boxOf(picture) : null;
    if (before && box && before.some((shown) => holds(shown, box))) return () => undefined;
    this.changed(before && box ? [...before, box] : null, true);
    return (): void => this.changed(this.told, false);
  }

  private tell(told: readonly Box[] | null): void {
    this.told = told;
    this.changed(told, false);
  }
}
