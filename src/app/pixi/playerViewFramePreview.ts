import { Graphics, type Application, type Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { requestRender } from './RenderScheduler';
import { drawDashedLine } from './vision/wallKindLook';

/** Half the length of the arms of the cross marking the frame's centre, in screen px. */
const CENTRE_ARM = 6;
/** The dashes of the outline of what players see now, in screen px. */
const DASH = { length: 6, gap: 5 } as const;

/** A frame on the map: its centre and size in world units. */
export interface WorldFrame {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/**
 * The area players would see, outlined on the GM's map around a world point while the GM picks
 * where to centre them, and dotted, where they see this map, the area they see now (`current`,
 * read at every redraw, since an unfrozen view follows the GM's camera). Drawn as a DM screen
 * overlay, so it is never in a player frame.
 */
export class PlayerViewFramePreview {
  private readonly frame = new Graphics();
  private readonly removeOverlay: () => void;
  private centre: { x: number; y: number } | null = null;

  constructor(
    private readonly app: Application,
    private readonly viewport: Viewport,
    /** The players' area in world units. */
    private readonly size: { width: number; height: number },
    addDmScreenOverlay: (overlay: Container) => () => void,
    private readonly current: () => WorldFrame | null = () => null,
  ) {
    this.removeOverlay = addDmScreenOverlay(this.frame);
    viewport.on('moved', this.redraw);
    viewport.on('zoomed', this.redraw);
    // What players see shows at once, before the pointer reaches the map
    this.redraw();
  }

  moveTo(x: number, y: number): void {
    this.centre = { x, y };
    this.redraw();
  }

  destroy(): void {
    this.viewport.off('moved', this.redraw);
    this.viewport.off('zoomed', this.redraw);
    this.removeOverlay();
    this.frame.destroy();
    requestRender(this.app);
  }

  private readonly redraw = (): void => {
    this.frame.clear();
    const now = this.current();
    if (now) this.drawCurrent(now);
    if (this.centre) this.drawPicked(this.centre.x, this.centre.y);
    requestRender(this.app);
  };

  /** The screen rect of a frame of `width` × `height` world units around world point (x, y). */
  private screenRect(x: number, y: number, width: number, height: number): { x: number; y: number; w: number; h: number } {
    const topLeft = this.viewport.toScreen(x - width / 2, y - height / 2);
    const bottomRight = this.viewport.toScreen(x + width / 2, y + height / 2);
    return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
  }

  /** What players see now: dotted, light on dark like the picked frame, so the two tell apart on any map. */
  private drawCurrent({ centerX, centerY, width, height }: WorldFrame): void {
    const { x, y, w, h } = this.screenRect(centerX, centerY, width, height);
    const corners = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as const;
    for (const [color, lineWidth] of [[0x000000, 4], [0xffffff, 2]] as const) {
      corners.forEach(([x1, y1], i) => {
        const [x2, y2] = corners[(i + 1) % 4]!;
        drawDashedLine(this.frame, x1, y1, x2, y2, color, lineWidth, DASH.length, DASH.gap);
      });
    }
  }

  private drawPicked(x: number, y: number): void {
    const { x: left, y: top, w, h } = this.screenRect(x, y, this.size.width, this.size.height);
    const centre = this.viewport.toScreen(x, y);
    // Light on dark, so it reads on any map
    this.frame
      .rect(left, top, w, h).fill({ color: 0xffffff, alpha: 0.08 })
      .rect(left, top, w, h).stroke({ width: 4, color: 0x000000, alpha: 0.6 })
      .rect(left, top, w, h).stroke({ width: 2, color: 0xffffff })
      .moveTo(centre.x - CENTRE_ARM, centre.y).lineTo(centre.x + CENTRE_ARM, centre.y)
      .moveTo(centre.x, centre.y - CENTRE_ARM).lineTo(centre.x, centre.y + CENTRE_ARM)
      .stroke({ width: 2, color: 0xffffff });
  }
}
