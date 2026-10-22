import { Container, Graphics, Text } from 'pixi.js';
import { resourceColor } from '../../../resources/resourceColors';
import type { VisibleResource } from '../../../resources/resourceTypes';
import { RESOURCE_NUMBER_SCALE, RESOURCE_NUMBER_STYLE } from '../../ResourceBarLabel';
import { destroyTree } from '../../utils/destroyTree';
import { BAR_LOOK, colorNumber } from './ResourceBarView';
import { WHEEL_SIZE, WHEEL_START, wheelGauge, type WheelGauge } from './wheelGeometry';

/** Width of the ring gauge, in UI units. */
const RING_WIDTH = 3;
/** The ring is set in from the border as a bar's fill is. */
const RING_RADIUS = WHEEL_SIZE / 2 - BAR_LOOK.border / 2 - BAR_LOOK.fillInset - RING_WIDTH / 2;
/** Width of the line between two segments, in UI units. */
const TICK_WIDTH = 0.8;
/**
 * PIXI builds a curve from a number of straight pieces that follows its radius in local
 * units, so a small circle scaled up on screen shows its corners. The wheel is drawn this
 * many times larger and scaled down again.
 */
const DRAW_SCALE = 16;
/** Characters that fit across the ring's hole at full size. */
const FULL_SIZE_CHARACTERS = 2;

/**
 * One resource as a wheel, in the bars' look: their border and dark track, a ring gauge
 * filled flat in the resource's colour, and the current value in its middle.
 */
export class ResourceWheelView {
  readonly view = new Container();
  private readonly ring = new Graphics();
  private readonly text = new Text({ text: '', resolution: 3, style: RESOURCE_NUMBER_STYLE });
  private drawn = '';

  constructor() {
    this.ring.scale.set(1 / DRAW_SCALE);
    this.text.anchor.set(0.5);
    this.view.addChild(this.ring, this.text);
  }

  /** Shows `resource` centred on (`x`, `y`). */
  update({ definition, value }: VisibleResource, x: number, y: number): void {
    this.view.position.set(x, y);
    const fixed = definition.direction === 'static';
    const label = String(fixed ? value.max : value.current);
    if (this.text.text !== label) this.text.text = label;
    this.text.scale.set(RESOURCE_NUMBER_SCALE * Math.min(1, FULL_SIZE_CHARACTERS / label.length));

    const color = resourceColor(definition, value);
    const key = `${color}|${value.current}|${value.max}|${definition.direction}`;
    if (key === this.drawn) return;
    this.drawn = key;
    // A static value is a whole ring around its number: nothing of it is spent, and it has no points to divide
    this.draw(colorNumber(color), fixed ? { share: 1, end: 0, ticks: [] } : wheelGauge(value));
  }

  setResolution(resolution: number): void {
    if (this.text.resolution !== resolution) this.text.resolution = resolution;
  }

  destroy(): void {
    destroyTree(this.view);
  }

  private draw(color: number, gauge: WheelGauge | null): void {
    const outer = (WHEEL_SIZE / 2) * DRAW_SCALE;
    const border = BAR_LOOK.border * DRAW_SCALE;
    const radius = RING_RADIUS * DRAW_SCALE;
    const width = RING_WIDTH * DRAW_SCALE;
    // Border and track as on a bar: the track covers the inner half of the border's stroke
    this.ring.clear()
      .circle(0, 0, outer).stroke({ width: border, color: BAR_LOOK.borderColor })
      .circle(0, 0, outer - border / 2).fill({ color: BAR_LOOK.trackColor })
      .circle(0, 0, radius).stroke({ width, color: BAR_LOOK.tickColor, alpha: BAR_LOOK.tickAlpha });

    if (!gauge) return;
    if (gauge.share >= 1) {
      // A full ring is a circle: an arc that ends where it began leaves a seam
      this.ring.circle(0, 0, radius).stroke({ width, color });
    } else if (gauge.share > 0) {
      this.ring
        .moveTo(Math.cos(WHEEL_START) * radius, Math.sin(WHEEL_START) * radius)
        .arc(0, 0, radius, WHEEL_START, gauge.end)
        .stroke({ width, color, cap: 'butt' });
    }
    for (const angle of gauge.ticks) {
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      this.ring
        .moveTo(cos * (radius - width / 2), sin * (radius - width / 2))
        .lineTo(cos * (radius + width / 2), sin * (radius + width / 2))
        .stroke({ width: TICK_WIDTH * DRAW_SCALE, color: BAR_LOOK.trackColor, cap: 'butt' });
    }
  }
}
