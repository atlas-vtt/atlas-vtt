/**
 * A change of the fog under way: the part of the picture that changed as it was, and how far the
 * fog has come from it to the picture it has now. The picture before is kept only while the fade
 * runs, and only where the change shows (`fogChangedRect.ts`).
 */
import { Texture, type TextureSource } from 'pixi.js';
import { getDomHost } from '../../host/dom';
import { MOTION_NORMAL_MS } from '../../utils/motion';
import type { HideableLayer } from '../playerSafeFrame';
import { ValueTransition } from '../utils/ValueTransition';
import { unitedCanvasRect, type CanvasRect } from './fogChangedRect';

export interface FogFadeDeps {
  /** The fade moved a step: the picture shows it and asks for a render. */
  readonly step: () => void;
  /** A picture of the map takes the fade in or leaves it out: the fog shows that, for this one render. */
  readonly switched: () => void;
  /** The fade began again from another picture, or ended, by itself or cut short: whoever draws with the picture before lets go of it. */
  readonly changed: () => void;
  /** The fade ended. */
  readonly ended: () => void;
}

/** The part of the fog's canvas a fade keeps as it was. */
interface Before {
  readonly canvas: HTMLCanvasElement;
  readonly texture: Texture;
  /** Where on the fog's canvas it lies. */
  readonly rect: CanvasRect;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get 2D context for the fog fade');
  return ctx;
}

/** `rect` of the canvas `shown`, on a canvas of its own. */
function cut(shown: HTMLCanvasElement, rect: CanvasRect): HTMLCanvasElement {
  const canvas = getDomHost().createCanvas(undefined, { width: rect.width, height: rect.height });
  contextOf(canvas).drawImage(shown, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas;
}

/**
 * Makes `before` the picture a fade from it to `after` shows at `progress`: each pixel the share
 * `1 - progress` of what it was plus `progress` of `after`, read at `rect` of its canvas. Both
 * hold the fog's one colour, premultiplied, so the sum is the mix.
 */
export function mixCanvasInto(before: HTMLCanvasElement, after: HTMLCanvasElement, rect: CanvasRect, progress: number): void {
  const ctx = contextOf(before);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1 - progress;
  ctx.fillRect(0, 0, before.width, before.height);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = progress;
  ctx.drawImage(after, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  ctx.restore();
}

function release({ canvas, texture }: Before): void {
  if (!texture.destroyed) texture.destroy(true);
  canvas.width = 1;
  canvas.height = 1;
}

/**
 * As a layer of a picture of the map (`visible`), the fade is what that picture may leave out:
 * hidden, the fog shows as the fade will leave it.
 */
export class FogFade implements HideableLayer {
  private before: Before | null = null;
  /** Whether the picture before is itself a mix of two: a change came during a fade. */
  private mixed = false;
  private shown = true;
  private readonly progress: ValueTransition;

  constructor(private readonly deps: FogFadeDeps) {
    this.progress = new ValueTransition(0, MOTION_NORMAL_MS, () => { if (this.before) deps.step(); });
  }

  get running(): boolean {
    return this.before !== null;
  }

  /** How far the fog has come from the picture before to the one it has: 1 without a fade, and for a picture that leaves it out. */
  get mix(): number {
    return this.before && this.shown ? this.progress.value : 1;
  }

  /** The picture the fade comes from; null while none runs. */
  get source(): TextureSource | null {
    return this.before?.texture.source ?? null;
  }

  /** Where on the fog's canvas the picture before lies; null while no fade runs. */
  get rect(): CanvasRect | null {
    return this.before?.rect ?? null;
  }

  /** Whether the picture before shows the fog as it once was, with its own edge; a mix of two pictures has no edge to cut. */
  get cutsBefore(): boolean {
    return !this.mixed;
  }

  get visible(): boolean {
    return this.shown;
  }

  set visible(shown: boolean) {
    if (shown === this.shown) return;
    this.shown = shown;
    this.deps.switched();
  }

  /**
   * The fog fades from what `shown`, its canvas, holds now to what is drawn on it next; `rect` is
   * where the two will differ. A fade that runs goes on from what it shows now: the picture it
   * came from, as far mixed with the canvas as the fade had come.
   */
  start(shown: HTMLCanvasElement, rect: CanvasRect): void {
    const earlier = this.before;
    const united = earlier ? unitedCanvasRect(earlier.rect, rect) : rect;
    const canvas = cut(shown, united);
    if (earlier) {
      const progress = this.progress.value;
      mixCanvasInto(earlier.canvas, shown, earlier.rect, progress);
      const ctx = contextOf(canvas);
      const x = earlier.rect.x - united.x;
      const y = earlier.rect.y - united.y;
      ctx.clearRect(x, y, earlier.rect.width, earlier.rect.height);
      ctx.drawImage(earlier.canvas, x, y);
      if (progress > 0) this.mixed = true;
    } else {
      this.mixed = false;
    }
    this.before = { canvas, texture: Texture.from(canvas), rect: united };
    this.deps.changed();
    if (earlier) release(earlier);
    this.progress.jumpTo(0);
    this.progress.animateTo(1, () => this.end());
  }

  /** Ends the fade now: the fog shows as it is, and the picture before is given back. */
  end(): void {
    const { before } = this;
    if (!before) return;
    this.before = null;
    this.progress.cancel();
    this.deps.changed();
    release(before);
    this.deps.ended();
  }
}
