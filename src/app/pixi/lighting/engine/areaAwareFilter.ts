import { Filter, Matrix, Sprite, Texture, type FilterSystem, type FilterWithShader, type RenderSurface, type UniformGroup } from 'pixi.js';

/**
 * A filter that knows where its area starts on screen. PIXI tells a filter that (`uOutputFrame`)
 * only when it is the last of its chain. `calculateSpriteMatrix` for a sprite at the origin with a
 * 1 px texture maps input coordinates to screen pixels, so its translation is that start for any
 * position: written into `origin` (a uniform of `group`) before each pass.
 */
export class AreaAwareFilter extends Filter {
  private readonly probe = new Sprite(Texture.WHITE);
  private readonly probeMatrix = new Matrix();

  constructor(options: FilterWithShader, private readonly origin: Float32Array, private readonly group: UniformGroup) {
    super(options);
  }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    const { tx, ty } = filterManager.calculateSpriteMatrix(this.probeMatrix, this.probe);
    this.origin[0] = tx;
    this.origin[1] = ty;
    this.group.update();
    filterManager.applyFilter(this, input, output, clearMode);
  }

  override destroy(destroyPrograms = false): void {
    this.probe.destroy();
    super.destroy(destroyPrograms);
  }
}
