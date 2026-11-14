/**
 * Graphics of the token drag ruler: the path runs just under the tokens, so the dragged
 * token covers its end under its centre; the distance label stands beside the path's middle,
 * clear of the dragged token and above the token UI so bars and nameplates never hide it.
 */

import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../grid/hexGeometry';
import type { HideableLayer } from '../playerSafeFrame';
import { BEYOND_SPEED, type MoveColor } from '../../measure/dragMovement';
import { cssColorToHexNumber, getObsidianAccentColor, getObsidianErrorColor } from '../utils/colorUtils';
import { drawMeasurePath, drawMeasurePoint } from '../utils/measureDrawing';
import { MeasureInk, MeasureInkLayer } from '../utils/measureInk';
import { MeasureLabel, watchMeasureLabelTheme } from '../utils/measureLabel';

/** Above token UI (100) and text (500), below drawings, vision and fog. */
const LABEL_Z_INDEX = 800;

interface Drawn {
  readonly points: readonly Point[];
  readonly distance: string;
  readonly tokenRadius: number;
  readonly gridSize: number;
  /** The colour of the movement step the drag lies in; unset is the theme's accent. */
  readonly color?: MoveColor | undefined;
  /** The plain distance the players' picture shows in the accent, where they are not to read the GM's; unset: the GM's reading is theirs too. */
  readonly forPlayers?: string | undefined;
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

  /** Its path is put in right under the tokens, so it stays above the map and the grid; its label on top. */
  constructor(viewport: Viewport, tokenLayer: Container, name: string) {
    this.layer = new MeasureInkLayer(name);
    this.path = new MeasureInk(this.layer);
    this.label.view.zIndex = LABEL_Z_INDEX;
    this.layer.view.zIndex = tokenLayer.zIndex;
    viewport.addChildAt(this.layer.view, viewport.getChildIndex(tokenLayer));
    viewport.addChild(this.label.view);
    this.setVisible(false);
  }

  get layers(): HideableLayer[] {
    return [this.layer.view, this.label.view];
  }

  setVisible(visible: boolean): void {
    this.layer.view.visible = visible;
    this.label.view.visible = visible;
  }

  draw({ points, tokenRadius, gridSize }: Drawn, distance: string, color: number, zoom: number): void {
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
  }
}

/**
 * The drag ruler as it is drawn. Where the GM's reading tells what players are not to read (a
 * creature's speed, the step its move lies in), a second drawing holds theirs: the plain distance
 * in the accent, in the same place (`playersLayers`). It stays hidden until whoever shows the
 * players' picture swaps it in for the GM's.
 */
export class DragRulerView {
  private readonly own: RulerInk;
  /** The players' reading: made with the first drag that has one. */
  private players: RulerInk | null = null;
  /** What the ruler shows; a zoom or theme change draws it again. */
  private drawn: Drawn | null = null;
  private drawnZoom = 1;
  private readonly stopThemeWatch = watchMeasureLabelTheme(() => this.redraw());
  private readonly onZoom = (): void => {
    if (this.drawn && this.viewport.scale.x !== this.drawnZoom) this.redraw();
  };

  constructor(private readonly viewport: Viewport, private readonly tokenLayer: Container) {
    this.own = new RulerInk(viewport, tokenLayer, 'drag-ruler-path');
    this.viewport.on('zoomed', this.onZoom);
    this.viewport.on('zoomed-end', this.onZoom);
    this.clear();
  }

  /**
   * Draws the path through `points` with `distance` beside its middle, clear of a token of
   * `tokenRadius` (world units) at its end, the label sized as token UI on a grid of `gridSize`.
   * `color` is the movement step the drag lies in (`dragMove`); without one the path is the accent's.
   * `forPlayers` is the plain distance the players' picture shows in its place, in the accent.
   */
  draw(points: readonly Point[], distance: string, tokenRadius: number, gridSize: number, color?: MoveColor, forPlayers?: string): void {
    if (points.length === 0) return;
    this.drawn = { points, distance, tokenRadius, gridSize, color, forPlayers };
    this.redraw();
    this.own.setVisible(true);
  }

  clear(): void {
    this.drawn = null;
    this.own.clear();
    this.players?.clear();
  }

  /** The GM's reading: its path and its label. */
  get layers(): HideableLayer[] {
    return this.own.layers;
  }

  /** The players' reading of the drag drawn now; none while the GM's is theirs too. */
  get playersLayers(): HideableLayer[] {
    return this.players && this.drawn?.forPlayers !== undefined ? this.players.layers : [];
  }

  destroy(): void {
    this.stopThemeWatch();
    this.viewport.off('zoomed', this.onZoom);
    this.viewport.off('zoomed-end', this.onZoom);
    this.own.destroy();
    this.players?.destroy();
  }

  private redraw(): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const zoom = this.viewport.scale.x;
    this.drawnZoom = zoom;
    this.own.draw(drawn, drawn.distance, inkColor(drawn.color), zoom);
    if (drawn.forPlayers === undefined) {
      this.players?.clear();
      return;
    }
    this.players ??= new RulerInk(this.viewport, this.tokenLayer, 'drag-ruler-path-players');
    this.players.draw(drawn, drawn.forPlayers, inkColor(undefined), zoom);
  }
}
