import type { Container, Graphics } from 'pixi.js';
import { rangeCheckLine, rangeCheckText } from '../../measure/rangeCheck';
import type { PlacedToken, TokenGrid } from '../../measure/tokenDistance';
import type { Point } from '../../types/visionTypes';
import { MeasureInk, type MeasureInkLayer } from '../utils/measureInk';
import { MeasureLabel } from '../utils/measureLabel';
import type { MeasureLook } from './DrawnMeasure';

/** A dash and the gap after it, in screen pixels; the line's round ends reach a little into the gap. */
const DASH = { on: 5, off: 7 } as const;
/** A line of more dashes than this (across a large map, zoomed in) takes longer ones. */
const MAX_DASHES = 160;

/** The two tokens a check runs between. */
export interface CheckedPair {
  readonly from: PlacedToken;
  readonly to: PlacedToken;
}

/** Traces the line from `from` to `to` (screen pixels) as dashes of one length on screen. */
function traceDashes(g: Graphics, from: Point, to: Point): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (!(length > 0)) return;
  const count = Math.max(1, Math.min(MAX_DASHES, Math.round(length / (DASH.on + DASH.off))));
  const step = length / count;
  const on = step * (DASH.on / (DASH.on + DASH.off));
  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  // Half a gap before the first dash and after the last, so the line ends as it begins.
  const lead = (step - on) / 2;
  for (let i = 0; i < count; i++) {
    const start = lead + i * step;
    g.moveTo(from.x + ux * start, from.y + uy * start);
    g.lineTo(from.x + ux * (start + on), from.y + uy * (start + on));
  }
}

/**
 * The range check as it is drawn: a dashed line in the measure ink between the two tokens'
 * nearest edges, and their distance on the measure label beside it. Tokens whose spaces touch
 * have no line; the label stands above the place where they meet.
 */
export class RangeCheck {
  private readonly ink: MeasureInk;
  private readonly label = new MeasureLabel();
  private pair: CheckedPair | null = null;

  /** Its line goes onto `shapes`, its label into `labels`. */
  constructor(shapes: MeasureInkLayer, labels: Container) {
    this.ink = new MeasureInk(shapes);
    this.label.view.visible = false;
    labels.addChild(this.label.view);
  }

  /** The pair it shows now; null while it shows none. */
  get shown(): CheckedPair | null {
    return this.pair;
  }

  /** What its label reads; for tests. */
  get text(): string {
    return this.pair ? this.label.text.text : '';
  }

  show(pair: CheckedPair, grid: TokenGrid, look: MeasureLook): void {
    this.pair = pair;
    this.redraw(grid, look);
  }

  /** Draws it again as it is: the zoom, the theme, the grid or the rules changed. */
  redraw(grid: TokenGrid, look: MeasureLook): void {
    const pair = this.pair;
    if (!pair) return;
    const { from, to } = pair;
    const line = rangeCheckLine(from, to, grid);
    this.ink.begin(look.zoom);
    if (line) {
      const start = this.ink.screen(line.from);
      const end = this.ink.screen(line.to);
      this.ink.stroke((g) => traceDashes(g, start, end), look.accent);
    }
    const beside = line ? [line.from, line.to] : [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }];
    this.label.show(rangeCheckText(from, to, grid, look.settings), { beside }, look.zoom, grid.size);
    this.label.view.visible = true;
  }

  clear(): void {
    if (!this.pair) return;
    this.pair = null;
    this.ink.clear();
    this.label.view.visible = false;
  }

  destroy(): void {
    this.ink.destroy();
    this.label.destroy();
  }
}
