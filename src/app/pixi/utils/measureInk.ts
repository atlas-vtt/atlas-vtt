import { AlphaFilter, Container, Graphics } from 'pixi.js';
import type { Point } from '../../grid/hexGeometry';
import { CANVAS_INK, INK_SHADE, type InkBand } from './canvasInk';
import { destroyTree } from './destroyTree';
import type { HideableLayer } from '../playerSafeFrame';

/** Opacity of a measured area's fill: present, never hiding the map. */
const AREA_ALPHA = 0.14;

/** The middle of a ring dot: white, as the handles of a selected token. */
const HOLLOW_MIDDLE = 0xffffff;

/** Builds a path in screen pixels on `graphics`, ready to stroke or fill. */
export type InkTrace = (graphics: Graphics) => void;

/** The dark bands about a line of `stroke` screen pixels, outermost first: the shade, then the dark line. */
export function darkBands(stroke: number): InkBand[] {
  const keyline = stroke + 2 * CANVAS_INK.keyline;
  let reach = 0;
  const shade = INK_SHADE.map((band) => {
    reach += band.width;
    return { width: keyline + 2 * reach, alpha: band.alpha };
  });
  return [...shade.reverse(), { width: keyline, alpha: CANVAS_INK.keylineAlpha }];
}

/**
 * The surface measurements are drawn on: their areas' washes beneath, and their lines composed in
 * one layer (a pass-through filter) laid onto the map as one, as the laser is. Max blending needs an
 * empty surface, and one layer for every measurement on it costs one pass however many there are.
 */
export class MeasureInkLayer {
  readonly view: Container;
  readonly areas = new Container({ label: 'measure-areas' });
  readonly lines = new Container({ label: 'measure-lines' });
  private readonly composite = new AlphaFilter({ alpha: 1, resolution: 'inherit', antialias: 'inherit' });

  constructor(label = 'measures') {
    this.view = new Container({ label, eventMode: 'none', interactiveChildren: false });
    this.lines.filters = [this.composite];
    this.view.addChild(this.areas, this.lines);
  }

  destroy(): void {
    destroyTree(this.view);
    this.composite.destroy();
  }
}

/** Shows or hides several display objects as one. */
class LinkedLayers implements HideableLayer {
  constructor(private readonly layers: readonly HideableLayer[]) {}

  get visible(): boolean {
    return this.layers.every((layer) => layer.visible);
  }

  set visible(visible: boolean) {
    for (const layer of this.layers) layer.visible = visible;
  }
}

/**
 * A measurement drawn in the ink of the selection highlight on a `MeasureInkLayer`, at its size on
 * screen: `begin` scales it to the zoom, and the drawing calls take world points. Its pieces never add
 * up where they meet (at a joint, where a dot sits on the line, where a cone's edges join its arc):
 * an area's wash is one shape beneath; the dark bands are drawn with max blending, so a pixel takes
 * the darkest band over it, of this measurement or another, and never their sum; the accent above
 * them is opaque. `shape` shows or hides the measurement alone.
 */
export class MeasureInk {
  readonly shape: HideableLayer;
  private readonly area = new Graphics({ label: 'measure-area' });
  private readonly line = new Container({ label: 'measure-line' });
  private readonly dark = new Graphics({ label: 'measure-dark', blendMode: 'max' });
  private readonly accent = new Graphics({ label: 'measure-accent' });
  private zoom = 1;

  constructor(layer: MeasureInkLayer) {
    this.line.addChild(this.dark, this.accent);
    layer.areas.addChild(this.area);
    layer.lines.addChild(this.line);
    this.shape = new LinkedLayers([this.area, this.line]);
  }

  /** Clears the drawing and sizes what follows for `zoom` (screen pixels per world unit). */
  begin(zoom: number): void {
    this.zoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    this.area.scale.set(1 / this.zoom);
    this.line.scale.set(1 / this.zoom);
    this.clear();
  }

  clear(): void {
    this.area.clear();
    this.dark.clear();
    this.accent.clear();
  }

  /** Where a world point lies in the drawing's screen pixels. */
  screen(point: Point): Point {
    return { x: point.x * this.zoom, y: point.y * this.zoom };
  }

  /** Strokes `trace` as the accent line, held by its dark bands. */
  stroke(trace: InkTrace, color: number): void {
    for (const band of darkBands(CANVAS_INK.stroke)) {
      trace(this.dark);
      this.dark.stroke({ width: band.width, color: 0x000000, alpha: band.alpha, cap: 'round', join: 'round' });
    }
    trace(this.accent);
    this.accent.stroke({ width: CANVAS_INK.stroke, color, cap: 'round', join: 'round' });
  }

  /**
   * A dot of `radius` screen pixels at the world point, in the same ink as the line it sits on; a
   * `hollow` one is a ring of the line's width around a white middle.
   */
  dot(point: Point, radius: number, color: number, hollow = false): void {
    const { x, y } = this.screen(point);
    for (const band of darkBands(2 * radius)) this.dark.circle(x, y, band.width / 2).fill({ color: 0x000000, alpha: band.alpha });
    this.accent.circle(x, y, radius).fill(color);
    if (hollow) this.accent.circle(x, y, radius - CANVAS_INK.stroke).fill(HOLLOW_MIDDLE);
  }

  /** Fills `trace` with a light, even wash of `color`. */
  fill(trace: InkTrace, color: number): void {
    trace(this.area);
    this.area.fill({ color, alpha: AREA_ALPHA });
  }

  /** Takes the measurement off its layer. */
  destroy(): void {
    destroyTree(this.area);
    destroyTree(this.line);
  }
}
