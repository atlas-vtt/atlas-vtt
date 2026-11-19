import { BlurFilter, Graphics, type Container } from 'pixi.js';
import type { Point } from '../../types/visionTypes';
import { prefersReducedMotion } from '../../utils/motion';
import { destroyTree } from '../utils/destroyTree';
import { ValueTransition } from '../utils/ValueTransition';

/** One line the glow follows: an area's outline (`closed`), or a ruler's path. */
export interface GlowPath {
  readonly points: readonly Point[];
  readonly closed: boolean;
}

/** How a measurement glows once it was pinned. */
const GLOW = {
  ms: 1100,
  /** The halo's width and its softness, screen pixels. */
  width: 9,
  blur: 7,
  /** Its brightest opacity, and how far it swells outward from where the measurement starts, a share of its size. */
  peak: 0.85,
  swell: 0.035,
} as const;

/**
 * A soft halo along a measurement's outline (a ruler: its path), in the measurement's colour: it
 * swells in at once, then breathes out as it widens a little, so a measurement just pinned says that
 * it stays. It lies in the measurement's own labels, so it shows and hides, fades and grows with it.
 * Under reduced motion it fades without widening.
 */
export class MeasureGlow {
  private readonly view = new Graphics({ label: 'measure-glow', eventMode: 'none' });
  private readonly blur = new BlurFilter({ strength: GLOW.blur, quality: 3, resolution: 'inherit' });
  private run: ValueTransition | null = null;

  constructor(parent: Container) {
    this.view.filters = [this.blur];
    this.view.visible = false;
    // Beneath the labels it stands with.
    parent.addChildAt(this.view, 0);
  }

  /** Glows along `paths` in `color`, drawn at `zoom`, swelling out from `about` (world). */
  play(paths: readonly GlowPath[], color: number, zoom: number, about: Point): void {
    this.stop();
    const g = this.view;
    const onScreen = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    g.clear();
    for (const { points, closed } of paths) {
      if (points.length < 2) continue;
      g.poly(points.flatMap(({ x, y }) => [x, y]), closed);
    }
    g.stroke({ width: GLOW.width / onScreen, color, cap: 'round', join: 'round' });
    g.pivot.set(about.x, about.y);
    g.position.set(about.x, about.y);
    const swell = prefersReducedMotion(document.body) ? 0 : GLOW.swell;
    g.visible = true;
    this.run = new ValueTransition(0, GLOW.ms, (progress) => {
      // Up within the first part of its time, then a long breath out.
      g.alpha = GLOW.peak * Math.sin(Math.PI * Math.min(1, progress)) ** 0.7;
      g.scale.set(1 + swell * progress);
    });
    this.run.animateTo(1, () => this.stop());
  }

  stop(): void {
    this.run?.cancel();
    this.run = null;
    this.view.visible = false;
  }

  destroy(): void {
    this.stop();
    destroyTree(this.view);
    this.blur.destroy();
  }
}
