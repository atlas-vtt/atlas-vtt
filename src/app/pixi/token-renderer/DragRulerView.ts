/**
 * Graphics of the token drag ruler: the path runs just under the tokens so the
 * dragged token covers its own end point, the distance label sits halfway
 * along the path, above the token UI so bars and nameplates never hide it.
 */

import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../grid/hexGeometry';
import type { HideableLayer } from '../playerSafeFrame';
import { cssColorToHexNumber, getObsidianAccentColor } from '../utils/colorUtils';
import { destroyTree } from '../utils/destroyTree';
import { createMeasureLabelText, drawMeasureLabel, drawMeasurePath, drawMeasurePoint } from '../utils/measureDrawing';
import { measureLabelFontSize, pathMidpoint } from '../utils/measureGeometry';

/** Above token UI (100) and text (500), below drawings, vision and fog. */
const LABEL_Z_INDEX = 800;

export class DragRulerView {
  private readonly path = new Graphics();
  private readonly label = new Container();
  private readonly pill = new Graphics();
  private readonly text = createMeasureLabelText();

  constructor(private readonly viewport: Viewport, tokenLayer: Container) {
    this.path.eventMode = 'none';
    this.label.eventMode = 'none';
    this.label.zIndex = LABEL_Z_INDEX;
    this.label.addChild(this.pill, this.text);
    // Same zIndex as the token layer, inserted right before it, so it stays above the map and grid.
    this.path.zIndex = tokenLayer.zIndex;
    this.viewport.addChildAt(this.path, this.viewport.getChildIndex(tokenLayer));
    this.viewport.addChild(this.label);
    this.clear();
  }

  /** Draws the path through `points` with `distance` labelled at its middle. */
  draw(points: readonly Point[], distance: string): void {
    const middle = pathMidpoint(points);
    if (!middle) return;
    const accent = cssColorToHexNumber(getObsidianAccentColor());
    const scale = this.viewport.scale.x;

    this.path.clear();
    drawMeasurePath(this.path, accent, points);
    // The dragged token covers the end point; the origin and waypoints stay marked.
    for (const point of points.slice(0, -1)) drawMeasurePoint(this.path, accent, point);

    this.text.text = distance;
    this.text.style.fontSize = measureLabelFontSize(scale);
    drawMeasureLabel(this.pill, this.text, middle, scale);

    this.path.visible = true;
    this.label.visible = true;
  }

  clear(): void {
    this.path.clear();
    this.pill.clear();
    this.path.visible = false;
    this.label.visible = false;
  }

  get layers(): HideableLayer[] {
    return [this.path, this.label];
  }

  destroy(): void {
    destroyTree(this.path);
    destroyTree(this.label);
  }
}
