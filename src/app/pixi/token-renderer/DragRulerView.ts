/**
 * Graphics of the token drag ruler: the path runs just under the tokens, so the dragged
 * token covers its end under its centre; the distance label stands beside the path's middle,
 * clear of the dragged token and above the token UI so bars and nameplates never hide it.
 * It comes and goes as a measurement being made does (`MeasurePresence`): its first drawing
 * fades in, and once the drag is over it dissolves where it lies.
 */

import { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../grid/hexGeometry';
import type { HideableLayer } from '../playerSafeFrame';
import { BEYOND_SPEED, type MoveColor } from '../../measure/dragMovement';
import { LIVE_DISSOLVE_MS, MEASURE_MOTION, MeasurePresence, PRESENT, type Presence } from '../measure/measurePresence';
import { cssColorToHexNumber, getObsidianAccentColor, getObsidianErrorColor } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { drawMeasurePath, drawMeasurePoint } from '../utils/measureDrawing';
import { MeasureInk, MeasureInkLayer } from '../utils/measureInk';
import { MeasureLabel } from '../utils/measureLabel';
import { watchDarkTheme } from '../utils/canvasBadgeColors';
import { watchSquareCorners } from '../utils/squareCorners';
import { viewportDocument } from '../utils/viewportDocument';

/** Above token UI (100) and text (500), below drawings, vision and fog. */
const LABEL_Z_INDEX = 800;

interface Drawn {
  readonly points: readonly Point[];
  readonly distance: string;
  readonly tokenRadius: number;
  readonly gridSize: number;
  /** The colour of the movement step the drag lies in; unset is the theme's accent. */
  readonly color?: MoveColor | undefined;
}

/** The ink of a drag: its step's colour, the theme's warning red past the last step, else the accent. Read at every draw, so it follows the theme. */
function inkColor(color: MoveColor | undefined): number {
  if (color === undefined) return cssColorToHexNumber(getObsidianAccentColor());
  return cssColorToHexNumber(color === BEYOND_SPEED ? getObsidianErrorColor() : color);
}

/** One reading of the drag on the map: its path under the tokens, and its label above the token UI. */
class RulerInk {
  private readonly layer: MeasureInkLayer;
  private readonly path: MeasureInk;
  private readonly label = new MeasureLabel();
  /** The label places its own view, so how far the ruler is on the map is set on what holds it. */
  private readonly labels = new Container({ label: 'drag-ruler-label', zIndex: LABEL_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private presence: Presence = PRESENT;
  /** Where the drag began: the ruler grows about it. */
  private start: Point = { x: 0, y: 0 };

  /** Its path is put in right under the tokens, so it stays above the map and the grid; its label on top. */
  constructor(viewport: Viewport, tokenLayer: Container, name: string) {
    this.layer = new MeasureInkLayer(name);
    this.path = new MeasureInk(this.layer);
    this.labels.addChild(this.label.view);
    this.layer.view.zIndex = tokenLayer.zIndex;
    viewport.addChildAt(this.layer.view, viewport.getChildIndex(tokenLayer));
    viewport.addChild(this.labels);
    this.setVisible(false);
  }

  get layers(): HideableLayer[] {
    return [this.layer.view, this.labels];
  }

  setVisible(visible: boolean): void {
    this.layer.view.visible = visible;
    this.labels.visible = visible;
  }

  /** How far it is on the map: path and label fade together and grow about where the drag began. */
  present(presence: Presence): void {
    this.presence = presence;
    this.place();
  }

  private place(): void {
    const { alpha, grow } = this.presence;
    const { x, y } = this.start;
    this.path.present(alpha, grow, this.start);
    this.labels.alpha = alpha;
    this.labels.scale.set(grow);
    this.labels.pivot.set(x, y);
    this.labels.position.set(x, y);
  }

  draw({ points, tokenRadius, gridSize }: Drawn, distance: string, color: number, zoom: number): void {
    this.start = points[0]!;
    this.place();
    this.path.begin(zoom);
    drawMeasurePath(this.path, color, points);
    // The dragged token covers the end point; the origin and waypoints stay marked.
    points.slice(0, -1).forEach((point, index) => drawMeasurePoint(this.path, color, point, index === 0));
    const end = points[points.length - 1]!;
    this.label.show(distance, { beside: points, avoid: tokenRadius > 0 ? { x: end.x, y: end.y, radius: tokenRadius } : null }, zoom, gridSize);
  }

  clear(): void {
    this.path.clear();
    this.setVisible(false);
  }

  destroy(): void {
    this.layer.destroy();
    this.label.destroy();
    destroyTree(this.labels);
  }
}

/** The drag ruler as it is drawn: one reading, the GM's and the players' alike. */
export class DragRulerView {
  private readonly own: RulerInk;
  /** What the ruler shows; a zoom or theme change draws it again. */
  private drawn: Drawn | null = null;
  private drawnZoom = 1;
  private readonly presence: MeasurePresence;
  /** Whether a drag's ruler is drawn: its first drawing fades in. */
  private shown = false;
  private readonly stopThemeWatch: () => void;
  private readonly stopCornerWatch: () => void;
  private readonly onZoom = (): void => {
    if (this.drawn && this.viewport.scale.x !== this.drawnZoom) this.redraw();
  };

  constructor(private readonly viewport: Viewport, tokenLayer: Container) {
    this.own = new RulerInk(viewport, tokenLayer, 'drag-ruler-path');
    this.presence = new MeasurePresence((presence) => this.own.present(presence));
    const { body } = viewportDocument(viewport);
    this.stopThemeWatch = watchDarkTheme(body, () => this.redraw());
    this.stopCornerWatch = watchSquareCorners(body, () => this.redraw());
    this.viewport.on('zoomed', this.onZoom);
    this.viewport.on('zoomed-end', this.onZoom);
    this.clear();
  }

  /**
   * Draws the path through `points` with `distance` beside its middle, clear of a token of
   * `tokenRadius` (world units) at its end, the label sized as token UI on a grid of `gridSize`.
   * `color` is the movement step the drag lies in (`dragMove`); without one the path is the accent's.
   */
  draw(points: readonly Point[], distance: string, tokenRadius: number, gridSize: number, color?: MoveColor): void {
    if (points.length === 0) return;
    this.drawn = { points, distance, tokenRadius, gridSize, color };
    this.redraw();
    this.own.setVisible(true);
    if (this.shown) return;
    this.shown = true;
    this.presence.enter(MEASURE_MOTION.live.from, MEASURE_MOTION.live.ms);
  }

  /** The drag is over: the ruler dissolves where it lies, as a measurement let go does. `gone` runs once nothing of it shows. */
  dissolve(gone: () => void): void {
    if (!this.shown) {
      this.clear();
      gone();
      return;
    }
    this.shown = false;
    this.presence.exit(() => {
      this.clear();
      gone();
    }, LIVE_DISSOLVE_MS);
  }

  /** Takes the ruler off the map at once. */
  clear(): void {
    this.presence.settle();
    this.shown = false;
    this.drawn = null;
    this.own.clear();
  }

  /** Its path and its label. */
  get layers(): HideableLayer[] {
    return this.own.layers;
  }

  destroy(): void {
    this.presence.stop();
    this.stopThemeWatch();
    this.stopCornerWatch();
    this.viewport.off('zoomed', this.onZoom);
    this.viewport.off('zoomed-end', this.onZoom);
    this.own.destroy();
  }

  private redraw(): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const zoom = this.viewport.scale.x;
    this.drawnZoom = zoom;
    this.own.draw(drawn, drawn.distance, inkColor(drawn.color), zoom);
  }
}
