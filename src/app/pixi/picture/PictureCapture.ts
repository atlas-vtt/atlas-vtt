import type { TesseraView } from '../mosaicCanvas/levelOfDetail';
import { applyLayerVisibility, frameCamera, type CameraTarget, type PlayerFrameCamera } from '../playerSafeFrame';
import type { Picture, PicturePart } from './picture';

/**
 * Every part of a map view that draws a picture differently, in the order a capture walks them:
 * their changes are made in this order and put back in the reverse, and an earlier part's
 * `renderFor` holds a later one's. The grid is none: players see it exactly as the GM set it, hidden included.
 */
export const PICTURE_PARTS = [
  'mapImage', 'roofs', 'pins', 'hexLinks', 'levelLinks', 'floorGhost', 'tokenPlacer', 'selection', 'gestures',
  'tokens', 'measures', 'liquids', 'lighting', 'fog', 'annotations', 'screenOverlays', 'playerFrameOnly',
] as const;

export type PicturePartName = (typeof PICTURE_PARTS)[number];

export interface PictureCaptureDeps {
  /** What the players' frame turns to its own camera: the view's viewport, none before it exists. */
  camera(): CameraTarget | null;
  /** Renders the GM's frame on the canvas again, after a players' frame that no render of the GM's follows. */
  renderGmFrame(): void;
}

/**
 * Renders the pictures of a map view, the players' frame and a picture of the scene: one capture
 * makes every part's change, renders, and puts every part back, also when the render throws.
 */
export class PictureCapture {
  private readonly parts = new Map<PicturePartName, PicturePart>();

  constructor(private readonly deps: PictureCaptureDeps) {}

  /** `part` says how `name` draws a picture from now on, in place of what said so before. */
  attach(name: PicturePartName, part: PicturePart): void {
    this.parts.set(name, part);
  }

  detach(name: PicturePartName): void {
    this.parts.delete(name);
  }

  /**
   * Runs `render` with the stage as `picture` shows it, and returns its result. Every part is put
   * back on its own, also when the render, a part's change or another part's restore throws; after
   * a players' frame that no render of the GM's follows, the GM's frame is rendered on the canvas
   * again, since the frame went through it. Then the first error, if any, is thrown.
   */
  capture<T>(picture: Picture, render: () => T): T {
    const restores: Array<() => void> = [];
    const errors: unknown[] = [];
    let rendered: { value: T } | null = null;
    try {
      rendered = { value: this.draw(picture, render, restores) };
    } catch (error) {
      errors.push(error);
    }
    for (const restore of restores.reverse()) {
      try {
        restore();
      } catch (error) {
        errors.push(error);
      }
    }
    if (picture.kind === 'players' && !picture.renderFollows) this.deps.renderGmFrame();
    if (errors.length > 0 || rendered === null) throw errors[0];
    return rendered.value;
  }

  /** Makes every part's change for `picture`, adding what puts each back to `restores` as it goes, and renders. */
  private draw<T>(picture: Picture, render: () => T, restores: Array<() => void>): T {
    const parts = this.walk();
    for (const part of parts) if (part.showFor) restores.push(part.showFor(picture));
    const layers = parts.flatMap((part) => part.layersFor?.(picture) ?? []);
    restores.push(applyLayerVisibility(layers, picture.kind === 'players' ? this.cameraOf(picture.frame) : undefined).restore);
    let held = render;
    for (const part of [...parts].reverse()) {
      const around = part.renderFor?.bind(part);
      if (!around) continue;
      const inner = held;
      held = (): T => around(picture, inner);
    }
    return held();
  }

  /** Keeps what `view` (the player window's frame) shows ready at its detail in every part, until the returned function; the levels below draw their snapshots' own. */
  keepReady(view: TesseraView): () => void {
    const releases = this.walk().flatMap((part) => (part.keepReady ? [part.keepReady(view)] : []));
    return (): void => {
      for (const release of releases) release();
    };
  }

  private cameraOf(frame: Parameters<typeof frameCamera>[1]): PlayerFrameCamera | undefined {
    const target = this.deps.camera();
    return target ? frameCamera(target, frame) : undefined;
  }

  private walk(): PicturePart[] {
    return PICTURE_PARTS.flatMap((name) => {
      const part = this.parts.get(name);
      return part ? [part] : [];
    });
  }
}
