import { Container, Graphics, type Ticker } from 'pixi.js';
import { barDimensions } from '../../../styles/designTokens';
import { resourceColor } from '../../../resources/resourceColors';
import type { VisibleResource } from '../../../resources/resourceTypes';
import { ResourceBarLabel } from '../../ResourceBarLabel';
import { destroyTree } from '../../utils/destroyTree';
import { AnimatedBarFill } from '../AnimatedBarFill';
import { squareCorners, uiCorner } from '../../utils/squareCorners';

/** The look every resource shares, bar or wheel: a thin grey border, a dark track, a fill set in from the border, faint ticks. */
export const BAR_LOOK = {
  border: 0.75,
  borderColor: 0x888888,
  trackColor: 0x1a1a1a,
  fillInset: 1,
  tickColor: 0x333333,
  tickAlpha: 0.5,
} as const;

const BORDER = BAR_LOOK.border;
const FILL_INSET = BAR_LOOK.fillInset;

/** `#rrggbb` as the number PIXI takes. */
export function colorNumber(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

/** One resource as a pill bar: dark track with tick marks, a fill in the resource's colour and "x / y". */
export class ResourceBarView {
  readonly view = new Container();
  private readonly track = new Graphics();
  private readonly fill: AnimatedBarFill;
  private readonly label = new ResourceBarLabel();
  private color = 0xffffff;
  /** Top the track was last drawn at; the track is static, so it is only redrawn when it moves. */
  private drawnTop: number | null = null;
  /** Whether the track was drawn with square corners: it is drawn again when they turn. */
  private drawnSquare = false;

  constructor(ticker: Ticker | null) {
    this.fill = new AnimatedBarFill(() => this.color, ticker);
    this.label.alpha = 0;
    this.view.addChild(this.track, this.fill.view, this.label);
  }

  /** Shows `resource` with the bar's top edge at `top`; returns the height it takes. */
  update({ definition, value }: VisibleResource, top: number, animate: boolean): number {
    const { width, height } = barDimensions.token;
    this.color = colorNumber(resourceColor(definition, value));
    const inner = { x: -width / 2 + BORDER / 2, y: top + BORDER / 2, width: width - BORDER, height: height - BORDER };
    const square = squareCorners();
    if (this.drawnTop !== top || this.drawnSquare !== square) {
      this.drawnTop = top;
      this.drawnSquare = square;
      this.drawTrack(top, inner);
    }
    // A static value fills its bar: there is no share of it to show
    const fixed = definition.direction === 'static';
    this.fill.set(fixed ? 1 : value.max > 0 ? value.current / value.max : 0, {
      x: inner.x + FILL_INSET,
      y: inner.y + FILL_INSET,
      width: inner.width - FILL_INSET * 2,
      height: inner.height - FILL_INSET * 2,
    }, animate);
    if (fixed) this.label.setFixed(value.max);
    else this.label.setValue(value);
    this.label.position.set(0, top + height / 2);
    return height;
  }

  get textAlpha(): number {
    return this.label.alpha;
  }

  setTextAlpha(alpha: number): void {
    this.label.alpha = alpha;
  }

  setResolution(resolution: number): void {
    this.label.setResolution(resolution);
  }

  destroy(): void {
    this.fill.destroy();
    destroyTree(this.view);
  }

  private drawTrack(top: number, inner: { x: number; y: number; width: number; height: number }): void {
    const { width, height } = barDimensions.token;
    this.track.clear()
      .roundRect(-width / 2, top, width, height, uiCorner(height / 2))
      .stroke({ width: BORDER, color: BAR_LOOK.borderColor, alpha: 1 })
      .roundRect(inner.x, inner.y, inner.width, inner.height, uiCorner(inner.height / 2))
      .fill({ color: BAR_LOOK.trackColor, alpha: 1 });
    const tick = inner.width / 10;
    for (let i = 1; i < 10; i++) {
      this.track
        .moveTo(inner.x + tick * i, inner.y + 1)
        .lineTo(inner.x + tick * i, inner.y + inner.height - 1)
        .stroke({ width: 0.5, color: BAR_LOOK.tickColor, alpha: BAR_LOOK.tickAlpha });
    }
  }
}
