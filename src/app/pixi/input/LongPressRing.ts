import { Graphics, type Ticker } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { MAP_LAYER_Z } from '../mapLayerOrder';
import { destroyTree } from '../utils/destroyTree';

/** The ring on the screen (px): wide enough to show around the finger that covers its middle. */
const RADIUS = 34;
const LINE_WIDTH = 2.5;
const TRACK_ALPHA = 0.25;
const TOP = -Math.PI / 2;

export interface LongPressRingLook {
  accent(): number;
  reducedMotion(): boolean;
}

/**
 * The ring that closes around a finger while its press becomes a long press, so the user sees
 * what is coming. It keeps its size on the screen, is drawn above the lighting and the fog, and
 * runs on the app's ticker only while it grows; at rest nothing of it is left.
 */
export class LongPressRing {
  readonly layer = new Graphics({ label: 'long-press-ring', eventMode: 'none', visible: false });
  private startedAt = 0;
  private duration = 0;
  private growing = false;

  constructor(private readonly viewport: Viewport, private readonly ticker: Ticker, private readonly look: LongPressRingLook) {
    this.layer.zIndex = MAP_LAYER_Z.longPressRing;
    viewport.addChild(this.layer);
  }

  /** Shows the ring around a point of the screen; it closes within `ms`. */
  show(x: number, y: number, ms: number): void {
    this.hide();
    this.layer.position.copyFrom(this.viewport.toWorld(x, y));
    this.layer.scale.set(1 / (this.viewport.scale.x || 1));
    this.layer.visible = true;
    // With reduced motion the ring is there, whole, and does not move.
    if (ms <= 0 || this.look.reducedMotion()) {
      this.draw(1);
      return;
    }
    this.startedAt = performance.now();
    this.duration = ms;
    this.growing = true;
    this.draw(0);
    this.ticker.add(this.grow);
  }

  hide(): void {
    this.stopGrowing();
    if (!this.layer.visible) return;
    this.layer.visible = false;
    this.layer.clear();
  }

  destroy(): void {
    this.stopGrowing();
    destroyTree(this.layer);
  }

  private readonly grow = (): void => {
    const progress = Math.min(1, (performance.now() - this.startedAt) / this.duration);
    this.draw(progress);
    if (progress >= 1) this.stopGrowing();
  };

  private stopGrowing(): void {
    if (!this.growing) return;
    this.growing = false;
    this.ticker.remove(this.grow);
  }

  private draw(progress: number): void {
    const color = this.look.accent();
    this.layer.clear();
    this.layer.circle(0, 0, RADIUS).stroke({ width: LINE_WIDTH, color, alpha: TRACK_ALPHA });
    if (progress <= 0) return;
    if (progress >= 1) this.layer.circle(0, 0, RADIUS).stroke({ width: LINE_WIDTH, color });
    else this.layer.arc(0, 0, RADIUS, TOP, TOP + progress * Math.PI * 2).stroke({ width: LINE_WIDTH, color, cap: 'round' });
  }
}
