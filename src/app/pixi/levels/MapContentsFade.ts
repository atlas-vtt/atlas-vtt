import type { Container } from 'pixi.js';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import { ValueTransition } from '../utils/ValueTransition';

export interface MapContentsFadeDeps {
  viewport: Container;
  /** The layers that stay: the map image moved, what it is placed against, and what hides the map from players. */
  keeps: (layer: Container) => boolean;
  requestRender: () => void;
  /** Whether motion is reduced: the fade then jumps. */
  reducedMotion: () => boolean;
}

/**
 * Fades what stands on the map (tokens, walls, lights, drawings, pins…) out while a floor's map image is moved
 * alone (Position floor), and back in once the move is written: what moves with the floor jumps to its new
 * place while nobody sees it. Each layer's own alpha is put back at the end.
 */
export class MapContentsFade {
  /** The layers faded, each with the alpha it had of its own. */
  private readonly faded = new Map<Container, number>();
  private readonly transition = new ValueTransition(1, MOTION_NORMAL_MS, (value) => this.apply(value));

  constructor(private readonly deps: MapContentsFadeDeps) {}

  out(): void {
    if (this.transition.targetValue === 0) return;
    for (const layer of this.deps.viewport.children) {
      if (!this.faded.has(layer) && !this.deps.keeps(layer)) this.faded.set(layer, layer.alpha);
    }
    this.move(0, () => undefined);
  }

  in(): void {
    if (this.faded.size === 0) return;
    this.move(1, () => this.restore());
  }

  destroy(): void {
    this.transition.cancel();
    this.restore();
  }

  private move(value: number, onDone: () => void): void {
    if (this.deps.reducedMotion()) {
      this.transition.jumpTo(value);
      onDone();
      return;
    }
    this.transition.animateTo(value, onDone);
  }

  private apply(value: number): void {
    for (const [layer, own] of this.faded) {
      if (!layer.destroyed) layer.alpha = own * value;
    }
    this.deps.requestRender();
  }

  private restore(): void {
    for (const [layer, own] of this.faded) {
      if (!layer.destroyed) layer.alpha = own;
    }
    this.faded.clear();
    this.deps.requestRender();
  }
}
