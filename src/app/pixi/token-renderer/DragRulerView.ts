/**
 * Graphics of the token drag ruler: the path runs just under the tokens, so the dragged
 * token covers its end under its centre; the distance label stands beside the path's middle,
 * clear of the dragged token and above the token UI so bars and nameplates never hide it.
 */

import type { Container } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../grid/hexGeometry';
import type { HideableLayer } from '../playerSafeFrame';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
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
}

export class DragRulerView {
  private readonly layer = new MeasureInkLayer('drag-ruler-path');
  private readonly path = new MeasureInk(this.layer);
  private readonly label = new MeasureLabel();
  /** What the ruler shows; a zoom or theme change draws it again. */
  private drawn: Drawn | null = null;
  private drawnZoom = 1;
  private readonly stopThemeWatch = watchMeasureLabelTheme(() => this.redraw());
  private readonly onZoom = (): void => {
    if (this.drawn && this.viewport.scale.x !== this.drawnZoom) this.redraw();
  };

  constructor(private readonly viewport: Viewport, tokenLayer: Container) {
    this.label.view.zIndex = LABEL_Z_INDEX;
    // Same zIndex as the token layer, inserted right before it, so it stays above the map and grid.
    this.layer.view.zIndex = tokenLayer.zIndex;
    this.viewport.addChildAt(this.layer.view, this.viewport.getChildIndex(tokenLayer));
    this.viewport.addChild(this.label.view);
    this.viewport.on('zoomed', this.onZoom);
    this.viewport.on('zoomed-end', this.onZoom);
    this.clear();
  }

  /**
   * Draws the path through `points` with `distance` beside its middle, clear of a token of
   * `tokenRadius` (world units) at its end, the label sized as token UI on a grid of `gridSize`.
   */
  draw(points: readonly Point[], distance: string, tokenRadius: number, gridSize: number): void {
    if (points.length === 0) return;
    this.drawn = { points, distance, tokenRadius, gridSize };
    this.redraw();
    this.layer.view.visible = true;
    this.label.view.visible = true;
  }

  clear(): void {
    this.drawn = null;
    this.path.clear();
    this.layer.view.visible = false;
    this.label.view.visible = false;
  }

  get layers(): HideableLayer[] {
    return [this.layer.view, this.label.view];
  }

  destroy(): void {
    this.stopThemeWatch();
    this.viewport.off('zoomed', this.onZoom);
    this.viewport.off('zoomed-end', this.onZoom);
    this.layer.destroy();
    this.label.destroy();
  }

  private redraw(): void {
    const drawn = this.drawn;
    if (!drawn) return;
    const { points, distance, tokenRadius, gridSize } = drawn;
    const accent = cssColorToHexNumber(getObsidianAccentColor());
    const zoom = this.viewport.scale.x;
    this.drawnZoom = zoom;
    this.path.begin(zoom);
    drawMeasurePath(this.path, accent, points);
    // The dragged token covers the end point; the origin and waypoints stay marked.
    points.slice(0, -1).forEach((point, index) => drawMeasurePoint(this.path, accent, point, index === 0));
    const end = points[points.length - 1]!;
    this.label.show(distance, { beside: points, avoid: tokenRadius > 0 ? { x: end.x, y: end.y, radius: tokenRadius } : null }, zoom, gridSize);
  }
}
