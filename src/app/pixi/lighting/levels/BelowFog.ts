import { Sprite, Texture } from 'pixi.js';
import { FogCoverageCache } from '../../../fog/FogCoverageCache';
import type { FogCoverage } from '../../../fog/fogCoverage';
import type { FogBounds, FogOperation } from '../../../types/fogTypes';
import { FogCanvasCompositor } from '../../fog/FogCanvasCompositor';
import { destroyTree } from '../../utils/destroyTree';

/** The canvas the fog is composed on, in texels per world pixel: as the view's own fog (`FogOfWarRenderer`). */
const FOG_SCALE = 0.5;

/**
 * The committed fog of a level below the view, over its picture through the view's openings: the
 * GM draws it on that level, and it hides what lies under it there for the players as on the
 * level itself. Composed on a canvas like the view's own fog (`FogCanvasCompositor`); fog whose
 * geometry cannot be read covers the whole level.
 */
export class BelowFog {
  readonly view = new Sprite({ texture: Texture.EMPTY, label: 'fog-below', eventMode: 'none' });
  private readonly cache = new FogCoverageCache();
  private compositor: FogCanvasCompositor | null = null;
  private texture: Texture | null = null;
  private operations: Readonly<Record<string, FogOperation>> | null = null;
  private mapKey: string | null = null;

  constructor(private readonly onChange: () => void) {}

  /**
   * Composes `operations` over a level of `bounds`, keyed by `mapKey` (`levelMapKey`); the same
   * operations and bounds again do nothing. A level without fog holds no canvas: on a large map one
   * takes 64 MB.
   */
  sync(operations: Readonly<Record<string, FogOperation>>, bounds: { width: number; height: number }, mapKey: string | null): void {
    const empty = Object.keys(operations).length === 0;
    const sized = !empty && this.size(bounds);
    if (!sized && operations === this.operations && mapKey === this.mapKey) return;
    this.operations = operations;
    this.mapKey = mapKey;
    if (empty) {
      this.release();
    } else {
      this.compositor!.composite(operations);
      this.texture!.source.update();
    }
    this.onChange();
  }

  /** The committed fog as the rules read it, null where its geometry cannot be read; none before the first `sync`. */
  coverage(): FogCoverage | null | undefined {
    return this.operations ? this.cache.get(this.operations, this.mapKey) : undefined;
  }

  destroy(): void {
    this.release();
    destroyTree(this.view);
  }

  /** Lets go of the canvas and its texture. */
  private release(): void {
    this.view.texture = Texture.EMPTY;
    this.texture?.destroy(true);
    this.compositor?.destroy();
    this.texture = null;
    this.compositor = null;
  }

  /** A compositor of the level's size; true where it was made anew. */
  private size({ width, height }: { width: number; height: number }): boolean {
    const bounds: FogBounds = { x: 0, y: 0, width, height };
    const current = this.compositor?.getBounds();
    if (current && current.width === width && current.height === height) return false;
    this.release();
    this.compositor = new FogCanvasCompositor(bounds, FOG_SCALE, this.cache, () => this.mapKey);
    this.texture = Texture.from(this.compositor.getCanvas());
    this.view.texture = this.texture;
    this.view.position.set(0, 0);
    this.view.width = width;
    this.view.height = height;
    return true;
  }
}
