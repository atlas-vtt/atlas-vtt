import { Container, Graphics } from 'pixi.js';
import { frameOutline, HANDLE_LOOK, handleSpots, turnSpot, type HandleRef, type HandleSet } from '../../annotations/annotationHandles';
import type { Point } from '../../types/visionTypes';
import { CANVAS_INK } from '../utils/canvasInk';
import { canvasBadgeColors, isDarkTheme } from '../utils/canvasBadgeColors';
import { destroyTree } from '../utils/destroyTree';
import { TurnGrip } from './TurnGrip';

/** What the handles show of a selection. */
export interface HandlesPicture {
  /** The frame with its handles; null where nothing selected may be moved (all of it locked). */
  readonly handles: HandleSet | null;
  /** The outlines drawn beside the frame, each the corners of one selected annotation's own frame: of several selected, and of a locked one. */
  readonly outlines: readonly (readonly Point[])[];
}

export interface AnnotationHandlesDeps {
  /** Screen pixels to a world pixel now. */
  zoom(): number;
  /** The theme's accent. */
  accent(): number;
  /** The picture changed in a way PIXI does not see (the turn handle's glyph came in). */
  readonly changed: () => void;
}

/** The quiet lines: the outline of each of several selected, and of what the pointer is over. */
const QUIET = { width: 1, alpha: 0.7 } as const;
const FRAME_WIDTH = 1.5;

const sameRef = (a: HandleRef | null, b: HandleRef | null): boolean => {
  if (a === null || b === null || a.kind !== b.kind) return a === b;
  if (a.kind === 'point' && b.kind === 'point') return a.index === b.index;
  if ((a.kind === 'corner' || a.kind === 'side') && (b.kind === 'corner' || b.kind === 'side')) return a.x === b.x && a.y === b.y;
  return true;
};

/**
 * The one set of handles drawings and texts have, as it is drawn: a frame around what is selected
 * with squares at its corners and sides, a disc above it that turns, dots on a line's points, and
 * a quiet outline around what the pointer is over. All of it in the theme's accent on the canvas
 * badges' ground, laid out in screen pixels in containers scaled back to the world, so it keeps
 * its size at every zoom; drawn again only when what it shows, the zoom or the theme is another.
 * It takes no pointer: `handleAt` says what a point takes. The GM's own (`AnnotationsRenderer.chrome`).
 */
export class AnnotationHandles {
  readonly view = new Container({ label: 'annotation-handles', eventMode: 'none', interactiveChildren: false });
  private readonly marks = new Container({ label: 'annotation-frame' });
  private readonly ink = new Graphics();
  private readonly turn: TurnGrip;
  private readonly hoverMark = new Graphics({ label: 'annotation-hover' });
  private picture: HandlesPicture | null = null;
  /** The handle the pointer is over or holds. */
  private hot: HandleRef | null = null;
  private hovered: readonly Point[] | null = null;
  private drawn = { picture: null as HandlesPicture | null, hot: null as HandleRef | null, hovered: null as readonly Point[] | null, look: '' };

  constructor(private readonly deps: AnnotationHandlesDeps) {
    this.turn = new TurnGrip(HANDLE_LOOK.turnRadius, deps.changed);
    this.marks.addChild(this.ink, this.turn.view);
    this.view.addChild(this.hoverMark, this.marks);
  }

  /** The frame and handles shown now; null while none are. */
  get handles(): HandleSet | null {
    return this.picture?.handles ?? null;
  }

  /** Shows `picture`, or nothing for null. A new object each time it is another: it is compared by identity. */
  show(picture: HandlesPicture | null): void {
    this.picture = picture;
    this.draw();
  }

  /** The handle the pointer is over or holds: it is drawn stronger. */
  setHot(ref: HandleRef | null): void {
    if (sameRef(ref, this.hot)) return;
    this.hot = ref;
    this.draw();
  }

  /** The outline of what the pointer is over and a press would take (its frame's corners); null over nothing. */
  hover(outline: readonly Point[] | null): void {
    this.hovered = outline;
    this.draw();
  }

  /** The zoom or the theme may be another. */
  redraw(): void {
    this.draw();
  }

  destroy(): void {
    this.turn.destroy();
    destroyTree(this.view);
  }

  private draw(): void {
    const zoom = this.deps.zoom();
    const accent = this.deps.accent();
    const look = `${zoom}|${accent}|${isDarkTheme()}`;
    const { drawn } = this;
    const fresh = look !== drawn.look;
    if (fresh || this.picture !== drawn.picture || !sameRef(this.hot, drawn.hot)) this.drawMarks(zoom, accent);
    if (fresh || this.hovered !== drawn.hovered) this.drawHover(zoom, accent);
    this.drawn = { picture: this.picture, hot: this.hot, hovered: this.hovered, look };
  }

  private drawHover(zoom: number, accent: number): void {
    const g = this.hoverMark.clear();
    const outline = this.hovered;
    const first = outline?.[0];
    if (!outline || !first) return;
    g.position.set(first.x, first.y);
    g.scale.set(1 / zoom);
    const corners = outline.flatMap((point) => [(point.x - first.x) * zoom, (point.y - first.y) * zoom]);
    g.poly(corners, true).stroke({ width: QUIET.width + 2 * CANVAS_INK.keyline, color: 0x000000, alpha: CANVAS_INK.keylineAlpha });
    g.poly(corners, true).stroke({ width: QUIET.width, color: accent, alpha: QUIET.alpha });
  }

  private drawMarks(zoom: number, accent: number): void {
    const g = this.ink.clear();
    const picture = this.picture;
    const handles = picture?.handles ?? null;
    const origin = handles?.frame.centre ?? picture?.outlines[0]?.[0];
    if (!picture || !origin) {
      this.turn.hide();
      return;
    }
    this.marks.position.set(origin.x, origin.y);
    this.marks.scale.set(1 / zoom);
    const px = (point: Point): Point => ({ x: (point.x - origin.x) * zoom, y: (point.y - origin.y) * zoom });
    const flat = (points: readonly Point[]): number[] => points.flatMap((point) => {
      const { x, y } = px(point);
      return [x, y];
    });
    for (const outline of picture.outlines) g.poly(flat(outline), true).stroke({ width: QUIET.width, color: accent, alpha: QUIET.alpha });
    if (!handles) {
      this.turn.hide();
      return;
    }
    const frame = flat(frameOutline(handles, zoom));
    g.poly(frame, true).stroke({ width: FRAME_WIDTH + 2 * CANVAS_INK.keyline, color: 0x000000, alpha: CANVAS_INK.keylineAlpha });
    g.poly(frame, true).stroke({ width: FRAME_WIDTH, color: accent });
    this.drawTurn(g, handles, zoom, accent, px);
    const { background } = canvasBadgeColors();
    const angle = (handles.frame.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const { ref, at } of handleSpots(handles, zoom)) {
      if (ref.kind === 'turn') continue;
      const { x, y } = px(at);
      const size = HANDLE_LOOK.grip * (sameRef(ref, this.hot) ? 1.3 : 1);
      if (ref.kind === 'point') g.circle(x, y, size);
      // A square turned as the frame is.
      else g.poly([[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sy]) => [x + (sx! * cos - sy! * sin) * size, y + (sx! * sin + sy! * cos) * size]), true);
      g.fill({ color: background }).stroke({ width: FRAME_WIDTH, color: accent });
    }
  }

  /** The turn handle on its stem above the frame's top side. */
  private drawTurn(g: Graphics, handles: HandleSet, zoom: number, accent: number, px: (point: Point) => Point): void {
    if (!handles.turn) {
      this.turn.hide();
      return;
    }
    const outline = frameOutline(handles, zoom);
    const top = px({ x: (outline[0]!.x + outline[1]!.x) / 2, y: (outline[0]!.y + outline[1]!.y) / 2 });
    const spot = px(turnSpot(handles, zoom));
    g.moveTo(top.x, top.y).lineTo(spot.x, spot.y).stroke({ width: FRAME_WIDTH, color: accent });
    this.turn.view.position.set(spot.x, spot.y);
    this.turn.show(this.hot?.kind === 'turn');
  }
}
