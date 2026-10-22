import { Container, Graphics, Text } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import { Spring, type SpringFeel } from './placementSpring';
import type { Point } from './placementLayout';

const FOLLOW: SpringFeel = { frequency: 30, damping: 0.9 };
const FADE: SpringFeel = { frequency: 22, damping: 1 };
/** Size of the count on screen, in pixels. */
const FONT_PX = 12;
const PAD_X = 6;
const HEIGHT_PX = 20;

/**
 * How many more tokens wait in the queue than it shows ("+4"): a small pill after its last place,
 * of one size on screen whatever the zoom, that follows the queue and fades as it empties.
 */
export class QueueCount {
  readonly root = new Container();
  private readonly pill = new Graphics();
  private readonly label: Text;
  private readonly x = new Spring(0, FOLLOW);
  private readonly y = new Spring(0, FOLLOW);
  private readonly alpha = new Spring(0, FADE);
  private count = 0;
  private placed = false;

  constructor(private readonly zoom: () => number, private readonly reducedMotion: boolean) {
    this.root.eventMode = 'none';
    this.label = new Text({
      text: '',
      style: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial', fontSize: FONT_PX, fontWeight: '600', fill: 0xffffff },
    });
    this.label.anchor.set(0, 0.5);
    this.label.position.set(PAD_X, 0);
    this.root.addChild(this.pill, this.label);
    this.root.alpha = 0;
  }

  /** Shows `count` with the pill's left end at `at` (world), or fades it out when `at` is null. */
  show(at: Point | null, count: number): void {
    if (!at || count <= 0) {
      this.alpha.target = 0;
      return;
    }
    if (!this.placed) {
      this.x.jump(at.x);
      this.y.jump(at.y);
      this.placed = true;
    }
    this.x.target = at.x;
    this.y.target = at.y;
    this.alpha.target = 1;
    if (count !== this.count) {
      this.count = count;
      this.label.text = `+${count}`;
      const width = this.label.width + PAD_X * 2;
      this.pill.clear().roundRect(0, -HEIGHT_PX / 2, width, HEIGHT_PX, HEIGHT_PX / 2).fill({ color: 0x000000, alpha: 0.7 });
    }
  }

  /** Moves the count `seconds` on; whether it still moves. */
  step(seconds: number): boolean {
    if (this.reducedMotion) {
      this.x.jump(this.x.target);
      this.y.jump(this.y.target);
    }
    this.x.step(seconds);
    this.y.step(seconds);
    this.alpha.step(seconds, 0.01);
    if (this.alpha.value <= 0.005 && this.alpha.target === 0) this.placed = false;
    this.root.position.set(this.x.value, this.y.value);
    this.root.scale.set(1 / Math.max(0.0001, this.zoom()));
    this.root.alpha = Math.max(0, Math.min(1, this.alpha.value));
    return !(this.x.atRest && this.y.atRest && this.alpha.atRest);
  }

  destroy(): void {
    destroyTree(this.root);
  }
}
